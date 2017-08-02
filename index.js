#!/usr/bin/env node

const exec = require('child_process').exec;
const fs = require('fs');

const chalk = require('chalk');
const Table = require('cli-table');

const CURRENT_BRANCH = 'git rev-parse --abbrev-ref HEAD';
const ORIGIN_COMMIT = branch => `git rev-parse origin/${branch}`;

let configRaw
try {
  configRaw = fs.readFileSync('./.build-status/config.json', 'utf8');
} catch (err) {
  console.log('You need to add a ./build-status/config.json');
  return;
}

let config;
try {
  config = JSON.parse(configRaw);
} catch (err) {
  console.log('Invalid config file');
  return;
}

let buildsRaw;
try {
  buildsRaw = fs.readFileSync('./.build-status/builds.json', 'utf8');
} catch (err) {
  buildsRaw = '{}';
}

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

  console.log('Getting pipeline status...');

  return new Promise((resolve, reject) => {
    // if (builds[commitsh]) {
    //   resolve({
    //     commitsh,
    //     status: builds[commitsh]
    //   });

    //   return;
    // }

    exec(`curl --silent --header "PRIVATE-TOKEN: ${config.privateToken}" "${url}"`,
      (err, stdout, stderr) => {
        if (err) {
          reject(stderr);
          return;
        }

        if (!stdout) {
          reject('No data');
          return;
        }

        const statuses = JSON.parse(stdout);
        resolve(statuses);
      });
  })
}

function saveBuildStatus(buildStatus) {
  builds[buildStatus.commitsh] = buildStatus.status;

  const data = JSON.stringify(builds, null, 2);
  fs.writeFileSync('./.build-status/builds.json', data);

  return buildStatus;
}

function printStatus(statuses) {
  // console.log(JSON.stringify(statuses, '', 2));
  const table = new Table({
    head: [
      '',
      chalk.white.bold('Coverage'),
      chalk.white.bold('Task')
    ],
  });

  const sorted = statuses.sort((s1, s2) => s1.id - s2.id);

  for (let i in sorted) {
    const status = statuses[i];
    switch (status.status) {
      case 'success':
        table.push([
          chalk.green('\uf00c'),
          status.coverage ? `${status.coverage}%` : '',
          status.name,
        ]);
        break;
      case 'failed':
        table.push([
          chalk.red('\uf00d'),
          '',
          status.name
        ]);
        break;
      case 'manual':
        table.push([
          chalk.cyan('\uf05e'),
          '',
          status.name,
        ]);
        break;
      case 'skipped':
        table.push([
          chalk.white('\uf18e'),
          '',
          status.name,
        ]);
        break;
      case 'pending':
        table.push([
          chalk.cyan('\uf021'),
          '',
          status.name,
        ]);
        break;
      case 'running':
        table.push([
          chalk.green('\uf04b'),
          '',
          status.name,
        ]);
      case 'created':
        table.push([
          chalk.green('\uf192'),
          '',
          status.name,
        ])
      default:
        table.push([
          chalk.cyan('\uf128'),
          '',
          `${status.name} (${status.status})`,
        ])
    }
  }

  console.log(table.toString());
}

getCurrentBranch()
  .then(getCommitshForUpstream)
  .then(fetchBuildStatus)
  .then(printStatus)
  .catch(err => {
    console.log(chalk.red('\uf05e Failed'));
    console.log(err);
  });
