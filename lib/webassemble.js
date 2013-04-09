'use strict';

var fs = require('fs'),
    path = require('path'),
    webmake = require('webmake'),
    findExports = require('./findExports'),
    count     = require('es5-ext/lib/Object/count'),
    readFile  = require('fs2/lib/read-file'),
    writeFile = require('fs2/lib/write-file');

/**
 * Finds all exported object in the source files, construct a preprocessed file (.pre file ext) for webmake to build the bundle file.
 * If no @destFile is specified, the content of the preprocessed file is returned.
 * @srcFiles source file(s)
 * @destFile destination file to write
 * @options options for webmake
 * @return assembled file content if no @destFile passed in
 */
module.exports = function (srcFiles, destFile, options) {
    var i, allExports;

    if (destFile) {
        i = destFile.lastIndexOf('/');
        if (i === destFile.length - 1) {
            console.warn('Dest ' + destFile + ' must not be a directory.');
            return;
        }
    }

    function constructFileContent(srcFile) {
        var isExists,
            output,
            code,
            allExports,
            eachExport;

        isExists = fs.existsSync(srcFile);
        if (!isExists) {
            console.warn('Source ' + srcFile + ' not found.');
            return '';
        }

        output = '// ----- Exports from ' + srcFile + ' -----\n';
        code = fs.readFileSync(srcFile),
        allExports = findExports(code);

        for (eachExport in allExports) {
            if (allExports.hasOwnProperty(eachExport)) {
                var relativePath = destFile ? path.relative(path.dirname(destFile), srcFile) : srcFile;
                output += 'exports.' + eachExport +
                    ' = require(\'' + relativePath + '\')' + (allExports[eachExport] ? '.' + eachExport : '') + ';\n';
            }
        }
        return output;
    }

    allExports = []
        .concat(srcFiles || [])
        .map(constructFileContent)
        .join('\n');

    if (!destFile || options.returnContentOnly) {
        return allExports;
    }

    var tmpFileName = destFile.replace('.js', '-pre.js');
    if (options.preProcessOnly) {
        fs.writeFileSync(tmpFileName, allExports);
        return;
    }

    (options || {}).output = destFile;

    // Below code is copied from webmake command because these parameters are not supported when using webmake programatically.
    var time = Date.now();
    webmake(tmpFileName, options)(function (parser) {
        time = Date.now() - time;
        if (options.name && options.amd) {
            return readFile(options.output)(function (src) {
                return writeFile(options.output, String(src).replace('(function',
                    'define("' + String(options.name) + '", function () { return (function') +
                    '});\n');
            })(parser);
        } else if (options.name) {
            return readFile(options.output)(function (src) {
                return writeFile(options.output, String(src).replace('(function',
                    'window.' + String(options.name) + ' = (function'));
            })(parser);
        } else if (options.amd) {
            return readFile(options.output)(function (src) {
                return writeFile(options.output, String(src).replace('(function',
                    'define(function () { return (function') + '});\n');
            })(parser);
        }
        return parser;
    }).end(function (parser) {
        console.log('Done [' + parser.modulesFiles.length + ' modules from ' +
            count(parser.packages) + ' packages in ' + (time / 1000).toFixed(2) +
            's]');
        console.log('File ' + destFile + ' created.');
    });
};