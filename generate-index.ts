/// <reference path="typings/node/node.d.ts" />

var dtRoot = '../DefinitelyTyped';

import proc = require('child_process');
import fs = require('fs');
import path = require('path');

function dtsHash(s: string) {
    // This is a whitespace-ignoring hash function so we can still correctly detect
    // .d.ts files that have been auto-formatted or line-ending-normalized
    var h = 0;
    for (var i = 0; i < s.length; i++) {
        var c = s.charCodeAt(i);
        switch (c) {
            case 0x00: // Null (?)
            case 0x09: // Tab
            case 0x0A: // LF
            case 0x0D: // CR
            case 0x20: // Space
            case 0xFEFF: // BOM bytes
                break;
            default:
                var high = h & 0xFF000000;
                h = (h << 8) & 0x7FFFFFFF;
                h = h ^ (high >> 24);
                h = h ^ c;
                break;
        }
    }
    return h.toString(36);
}

var result: any[] = [];
function runNextFile() {
    if (secondLevelFiles.length === 0) {
        fs.writeFile('data.json', JSON.stringify(result));
        return;
    }

    var dtsFile = secondLevelFiles.shift();

    console.log('Fetching commits for ' + dtsFile);
    getCommitsForFile(dtsFile, commits => {

        var record = {
            n: path.basename(dtsFile),
            h: [],
            p: path.dirname(dtsFile)
        };
        result.push(record);
        getCommitDetails(dtsFile, commits, detailedCommits => {
            detailedCommits.forEach(dc => {
                var ts = Math.floor(dc.timestamp / 1000);
                // Only list the most recent commit for any given hash
                if (!record.h.some(r => r === dc.fileId)) {
                    record.h.push(dc.fileId);
                }
            });
            runNextFile();
        });
    });
}


interface Commit {
    commitId: string;
    timestamp: number;
    message: string;
}

interface CommitWithSha extends Commit {
    fileId: string;
}

/// Gets a list of commits (up to 20) for this file
function getCommitsForFile(filename: string, callback: (result: Commit[]) => void) {
    var fakeQuote = 'QUOTEmarkGOEShereTHANKS';
    var eol = 'ENDOFlineGOESherePLEASE';
    var format = '{"commitId": "%H", "timestamp": %ct, "message": "%s" }'.replace(/\"/g, fakeQuote) + eol;
    var args = ['log', '--pretty=format:"' + format + '"', '--max-count=20', filename];

    proc.exec('git ' + args.join(' '), { cwd: dtRoot }, (err, stdout) => {
        if (err) throw err;
        var x = stdout.toString('UTF-8');
        x = x.replace(/\"/g, '\\\"');
        x = x.replace(new RegExp(fakeQuote, 'g'), '"');
        x = x.replace(new RegExp(eol, 'g'), ',');
        var arr = '[' + x.substr(0, x.length - 1) + ']';
        var obj = JSON.parse(arr);

        callback(obj);
    });
}

/// Given a file and set of commits, add file sha and size information to each commit object
function getCommitDetails(filename: string, commits: Commit[], callback: (commits: CommitWithSha[]) => void) {
    var commitsToProcess = commits.slice(0);

    var result: CommitWithSha[] = [];
    function getNext() {
        if (commitsToProcess.length === 0) {
            callback(result);
            return;
        }
        var commit = <CommitWithSha>commitsToProcess.shift();
        getHashAtCommit(commit.commitId, filename, (hash) => {
            if (hash.length > 0) {
                commit.fileId = hash;
                result.push(commit);
            }
            getNext();
        });
    }
    getNext();
}

/// Given a commit sha1 and a filename, get the sha1 and size of that file at that commit
function getHashAtCommit(commitId: string, filename: string, callback: (hash: string) => void) {
    var args = ['git', 'show', commitId + ':' + filename.replace(/\\/g, '/')];

    proc.exec(args.join(' '), { cwd: dtRoot }, (err, stdout) => {
        if (err) {
            callback('');
        }
        var s = stdout.toString('UTF-8');
        var hash = dtsHash(s);
        callback(hash);
    });

}


var secondLevelFiles: string[] = [];
var topLevelDirs = fs.readdirSync(dtRoot).map(f => path.join(dtRoot, f)).filter(f => fs.statSync(f).isDirectory());
topLevelDirs.forEach(dir => {
    var files = fs.readdirSync(dir).filter(f => /\.d\.ts$/.test(f)).map(f => path.join(dtRoot, dir, f));
    secondLevelFiles = secondLevelFiles.concat(files);
});
secondLevelFiles = secondLevelFiles.map(f => path.relative(dtRoot, f));
secondLevelFiles.sort();
console.log('Found ' + secondLevelFiles.length + ' .d.ts files');

runNextFile();

/*
fs.readFile('../DefinitelyTyped/alertify/alertify.d.ts', 'ASCII', (err, data) => {
    console.log('char 0 = ' + data.charCodeAt(0).toString(16));
    console.log(dtsHash(data));
});
*/
