const {existsSync, copyFileSync, chmodSync} = require('fs');
const {join} = require('path');

if (existsSync('.git')) {
    copyFileSync(join(__dirname, 'pre-commit'), join('.git','hooks','pre-commit'));
    chmodSync(join('.git','hooks','pre-commit'), '755');
    console.log('git pre-commit hook installed');
} else {
    console.warn('.git directory not found');
}