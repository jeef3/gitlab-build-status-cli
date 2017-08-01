#!/usr/bin/env node

const exec = require('child_process').exec;
const fs = require('fs');

const chalk = require('chalk');

const CURRENT_BRANCH = 'git rev-parse --abbrev-ref HEAD';
const ORIGIN_COMMIT = branch => `git rev-parse origin/${branch}`;

const configRaw = fs.readFileSync('./.build-status/config.json', 'utf8');
const config = JSON.parse(configRaw);

const buildsRaw = fs.readFileSync('./.build-status/builds.json', 'utf8');
const builds = JSON.parse(buildsRaw);

function getCurrentBranch() {
  return new Promise((resolve, reject) => {
    exec(CURRENT_BRANCH, (err, stdout, stderr) => {
      if (err) {
        reject(stderr);
        return;
      }

      const branch = stdout.replace(/\n/, '');

      resolve(branch);
    });
  });
}

function getCommitshForUpstream(branch) {
  return new Promise((resolve, reject) => {
    exec(ORIGIN_COMMIT(branch), (err, stdout, stderr) => {
      if (err) {
        reject(stderr)
        return;
      }

      const commitsh = stdout.replace(/\n/, '');
      resolve(commitsh);
    });
  })
}

function fetchBuildStatus(commitsh) {
  const url = `${config.url}/api/v4/projects/${config.projectId}/repository/commits/${commitsh}/statuses`;

  return new Promise((resolve, reject) => {
    if (builds[commitsh]) {
      resolve({
        commitsh,
        status: builds[commitsh]
      });

      return;
    }

    exec(`curl --silent --header "PRIVATE-TOKEN: ${config.privateToken}" "${url}"`,
      (err, stdout, stderr) => {
        if (err) {
          reject(stderr);
          return;
        }

        const statuses = JSON.parse(stdout);
        const failed = statuses.find(build => build.status === 'failed');
        const succeeded = statuses.find(build => build.status === 'success');

        if (failed) {
          resolve({
            commitsh,
            status: 'fail',
          });

          return;
        }

        if (succeeded) {
          resolve({
            commitsh,
            status: 'success',
          });

          return;
        }

        resolve({
          commitsh,
          status: 'unknown',
        });
      });
  })
}

function saveBuildStatus(buildStatus) {
  builds[buildStatus.commitsh] = buildStatus.status;

  const data = JSON.stringify(builds, null, 2);
  fs.writeFileSync('./.build-status/builds.json', data);

  return buildStatus;
}

function printStatus(buildStatus) {
  switch (buildStatus.status) {
    case 'success':
      console.log(chalk.green('\uf00c'));
      return;
    case 'fail':
      console.log(chalk.red('\uf00d'));
      return;
    default:
      console.log(chalk.cyan('\uf128'));
  }
}

getCurrentBranch()
  .then(getCommitshForUpstream)
  .then(fetchBuildStatus)
  .then(saveBuildStatus)
  .then(printStatus);
