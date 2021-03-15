const gulp = require('gulp')
const fs = require('fs-extra')
const path = require('path')
const chalk = require('chalk')
const archiver = require('archiver')
const stringify = require('json-stringify-pretty-compact')
const typescript = require('typescript')

const ts = require('gulp-typescript')
const sass = require('gulp-sass')
const git = require('gulp-git')
const publishRelease = require('publish-release')

const argv = require('yargs').argv

sass.compiler = require('sass')

function getConfig()
{
    const configPath = path.resolve(process.cwd(), 'foundryconfig.json')
    let config

    if(fs.existsSync(configPath)) {
        config = fs.readJSONSync(configPath)
        return config
    }
}

function getManifest() {
    const json = {}

    if (fs.existsSync('src')) {
        json.root = 'src'
    } else {
        json.root = 'dist'
    }

    const modulePath = path.join(json.root, 'module.json')
    const systemPath = path.join(json.root, 'system.json')

    if (fs.existsSync(modulePath)) {
        json.file = fs.readJSONSync(modulePath)
        json.name = 'module.json'
        json.path = modulePath
    } else if (fs.existsSync(systemPath)) {
        json.file = fs.readJSONSync(systemPath)
        json.name = 'system.json'
        json.path = systemPath
    } else {
        return
    }

    return json
}

/**
 * TypeScript transformers
 * @returns {typescript.TransformerFactory<typescript.SourceFile>}
 */
function createTransformer() {
    /**
     * @param {typescript.Node} node
     */
    function shouldMutateModuleSpecifier(node) {
        if (
            !typescript.isImportDeclaration(node) &&
            !typescript.isExportDeclaration(node)
        )
            return false
        if (node.moduleSpecifier === undefined) return false
        if (!typescript.isStringLiteral(node.moduleSpecifier)) return false
        if (
            !node.moduleSpecifier.text.startsWith('./') &&
            !node.moduleSpecifier.text.startsWith('../')
        )
            return false
        if (path.extname(node.moduleSpecifier.text) !== '') return false
        return true
    }

    /**
     * Transforms import/export declarations to append `.js` extension
     * @param {typescript.TransformationContext} context
     */
    function importTransformer(context) {
        return (node) => {
            /**
             * @param {typescript.Node} node
             */
            function visitor(node) {
                if (shouldMutateModuleSpecifier(node)) {
                    if (typescript.isImportDeclaration(node)) {
                        const newModuleSpecifier = typescript.createLiteral(
                            `${node.moduleSpecifier.text}.js`
                        )
                        return typescript.updateImportDeclaration(
                            node,
                            node.decorators,
                            node.modifiers,
                            node.importClause,
                            newModuleSpecifier
                        )
                    } else if (typescript.isExportDeclaration(node)) {
                        const newModuleSpecifier = typescript.createLiteral(
                            `${node.moduleSpecifier.text}.js`
                        )
                        return typescript.updateExportDeclaration(
                            node,
                            node.decorators,
                            node.modifiers,
                            node.exportClause,
                            newModuleSpecifier
                        )
                    }
                }
                return typescript.visitEachChild(node, visitor, context)
            }

            return typescript.visitNode(node, visitor)
        }
    }

    return importTransformer
}

const tsConfig = ts.createProject('tsconfig.json', {
    getCustomTransformers: (_program) => ({
        after: [createTransformer()],
    }),
})

/********************/
/*        BUILD        */
/********************/

/**
 * Build TypeScript
 */
function buildTS() {
    return gulp.src('src/**/*.ts').pipe(tsConfig()).pipe(gulp.dest('dist'))
}

/**
 * Build SASS
 */
function buildSASS() {
    return gulp
        .src('src/*.scss')
        .pipe(sass().on('error', sass.logError))
        .pipe(gulp.dest('dist'))
}

/**
 * Copy static files
 */
async function copyFiles() {
    const statics = [
        'lang',
        'fonts',
        'assets',
        'templates',
        'module.json',
        'system.json',
        'template.json',
    ]
    try {
        for (const file of statics) {
            if (fs.existsSync(path.join('src', file))) {
                await fs.copy(path.join('src', file), path.join('dist', file))
            }
        }
        return Promise.resolve()
    } catch (err) {
        Promise.reject(err)
    }
}

/**
 * Watch for changes for each build step
 */
function buildWatch() {
    gulp.watch([
        'src/**/*.ts',
        'src/**/*.scss'
    ], gulp.series(execBuild, copyToFoundry))
    gulp.watch(
        ['src/fonts', 'src/lang', 'src/templates', 'src/*.json'],
        { ignoreInitial: false },
        gulp.series(copyFiles, copyToFoundry)
    )
}

/********************/
/*        CLEAN        */
/********************/

/**
 * Remove built files from `dist` folder
 * while ignoring source files
 */
async function clean() {
    const name = path.basename(path.resolve('.'))
    const files = [
        'fonts',
        'lang',
        'templates',
        'assets',
        'module',
        `${name}.js`,
        `${name}.css`,
        'module.json',
        'system.json',
        'template.json'
    ]

    console.log(' ', chalk.yellow('Files to clean:'))
    console.log('   ', chalk.blueBright(files.join('\n    ')))

    // Attempt to remove the files
    try {
        for (const filePath of files) {
            await fs.remove(path.join('dist', filePath))
        }
        return Promise.resolve()
    } catch (err) {
        Promise.reject(err)
    }
}

/****************************/
/*        COPY TO FOUNDRY        */
/****************************/

/**
 * Copy to User Data folder
 */
async function copyToFoundry() {
    const name = path.basename(path.resolve('.'))
    const config = fs.readJSONSync('foundryconfig.json')

    let projectType
    try {
        if (
            fs.existsSync(path.resolve('.', 'dist', 'module.json')) ||
            fs.existsSync(path.resolve('.', 'src', 'module.json'))
        ) {
            projectType = 'modules'
        } else if (
            fs.existsSync(path.resolve('.', 'dist', 'system.json')) ||
            fs.existsSync(path.resolve('.', 'src', 'system.json'))
        ) {
            projectType = 'systems'
        } else {
            throw Error(
                `Could not find ${chalk.blueBright(
                    'module.json'
                )} or ${chalk.blueBright('system.json')}`
            )
        }

        let destDir
        if (config.dataPath) {
            if (!fs.existsSync(path.join(config.dataPath, 'Data')))
                throw Error('User Data path invalid, no Data directory found')

            destDir = path.join(config.dataPath, 'Data', projectType, name)
        } else {
            throw Error('No User Data path defined in foundryconfig.json')
        }

        if (argv.clean || argv.c) {
            console.log(
                chalk.yellow(`Removing build in ${chalk.blueBright(destDir)}`)
            )

            await fs.remove(destDir)
        }
        console.log(
            chalk.green(`Copying build to ${chalk.blueBright(destDir)}`)
        )
        await fs.copy(path.resolve('./dist'), destDir)

        return Promise.resolve()
    } catch (err) {
        Promise.reject(err)
    }
}

/*********************/
/*        PACKAGE         */
/*********************/

/**
 * Package build
 */
async function packageBuild() {
    const manifest = getManifest()

    return new Promise((resolve, reject) => {
        try {
            // Remove the package dir without doing anything else
            if (argv.clean || argv.c) {
                console.log(chalk.yellow('Removing all packaged files'))
                fs.removeSync('package')
                return
            }

            // Ensure there is a directory to hold all the packaged versions
            const packagePath = path.join('package', manifest.file.version)
            fs.ensureDirSync(packagePath)

            // Initialize the zip file
            const zipName = `${manifest.file.name}.zip`
            const zipFile = fs.createWriteStream(path.join(packagePath, zipName))
            const zip = archiver('zip', { zlib: { level: 9 } })

            zipFile.on('close', () => {
                console.log(chalk.green(zip.pointer() + ' total bytes'))
                console.log(
                    chalk.green(`Zip file ${zipName} has been written`)
                )
                return resolve()
            })

            zip.on('error', (err) => {
                throw err
            })

            zip.pipe(zipFile)

            // Add the directory with the final code
            zip.directory('dist/', manifest.file.name)

            zip.finalize()
        } catch (err) {
            return reject(err)
        }
    })
}

/*********************/
/*        PACKAGE         */
/*********************/

/**
 * Update version and URLs in the manifest JSON
 */
function updateManifest(cb) {
    const packageJson = fs.readJSONSync('package.json')
    const config = getConfig(),
        manifest = getManifest(),
        repoURL = config.repository

    if (!config) cb(Error(chalk.red('foundryconfig.json not found')))
    if (!manifest) cb(Error(chalk.red('Manifest JSON not found')))
    if (!repoURL)
        cb(
            Error(
                chalk.red(
                    'Repository URL not configured in foundryconfig.json'
                )
            )
        )

    try {
        const version = argv.release
        /* Update version */

        const versionMatch = /^(\d{1,}).(\d{1,}).(\d{1,})$/
        const currentVersion = manifest.file.version
        let targetVersion = ''

        if (!version) {
            cb(Error('Missing version number'))
        }

        if (versionMatch.test(version)) {
            targetVersion = version
        } else {
            targetVersion = currentVersion.replace(
                versionMatch,
                (substring, major, minor, patch) => {
                    console.log(
                        substring,
                        Number(major) + 1,
                        Number(minor) + 1,
                        Number(patch) + 1
                    )
                    if (version === 'major') {
                        return `${Number(major) + 1}.0.0`
                    } else if (version === 'minor') {
                        return `${major}.${Number(minor) + 1}.0`
                    } else if (version === 'patch') {
                        return `${major}.${minor}.${Number(patch) + 1}`
                    } else {
                        return ''
                    }
                }
            )
        }

        if (targetVersion === '') {
            return cb(Error(chalk.red('Error: Incorrect version arguments.')))
        }

        if (targetVersion === currentVersion) {
            return cb(
                Error(
                    chalk.red(
                        'Error: Target version is identical to current version.'
                    )
                )
            )
        }
        console.log(`Updating version number to '${targetVersion}'`)

        packageJson.version = targetVersion
        manifest.file.version = targetVersion

        manifest.file.name = packageJson.name
        manifest.file.author = packageJson.author
        manifest.file.description = packageJson.description

        /* Update URLs */
        const downloadURL = `${repoURL}/releases/download/${manifest.file.version}`

        manifest.file.url = repoURL
        manifest.file.manifest = `${downloadURL}/${manifest.name}`
        manifest.file.download = `${downloadURL}/${manifest.file.name}.zip`

        const prettyProjectJson = stringify(manifest.file, {
            maxLength: 35,
            indent: '\t',
        })

        fs.writeJSONSync('package.json', packageJson, { spaces: 2 })
        fs.writeFileSync(
            path.join(manifest.root, manifest.name),
            prettyProjectJson,
            'utf8'
        )

        return cb()
    } catch (err) {
        cb(err)
    }
}

function gitCommit() {
    return gulp.src('./*').pipe(
        git.commit(`${getManifest().file.version}`, {
            args: '-a',
            disableAppendPaths: true,
        })
    )
}

function gitRelease(cb) {
    const manifest = getManifest()
    const config = getConfig()
    const packagePath = path.join('package', manifest.file.version, `${manifest.file.name}.zip`)
    const options = {
        token: config.token,
        owner: config.owner,
        repo: manifest.file.name,
        tag: manifest.file.version,
        name: manifest.file.name,
        draft: false,
        prerelease: false,
        assets: [packagePath, manifest.path],
    }
    const release = publishRelease(options, function(err, release) {
        if(err)
        {
            return cb(Error(chalk.red(err.message)))
        }
    })

    release.on('created-release', function() {
        console.log(chalk.green('Release created successfully at https://github.com/' +
            options.owner + '/' + options.repo + '/releases/tag/' + options.tag))
    })

    release.on('upload-asset', function(name) {
        console.log(chalk.yellow(`Uploading asset ${name}`))
    })

    return cb()
}

const execGit = gulp.series(gitCommit, gitRelease)

const execBuild = gulp.parallel(buildTS, buildSASS)

exports.build = gulp.series(clean, execBuild, copyFiles)
exports.watch = buildWatch
exports.clean = clean
exports.copyToFoundry = copyToFoundry
exports.package = packageBuild
exports.update = updateManifest
exports.publish = gulp.series(
    clean,
    updateManifest,
    execBuild,
    packageBuild,
    execGit
)
