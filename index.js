const http = require('http')
const util = require('util');
const exec = util.promisify(require('child_process').exec);

const config = require('./config.json')

const serv = http.createServer(async (req, res) => {
  // Only accept json content type
  if (req.headers["content-type"] !== 'application/json') {
    return console.error('Bad request data format! Set content type to "application/json" in github webhook settings!')
  }
  // Get json from request object
  const payload = await getJSON(req);
  // console.log(repoData)
  // close connection
  res.end()
  //
  try {
    var repoData = handleWebHook(payload);
  } catch (e) {
    return console.error(e)
  }
  // Check if branch name matches currently set branch name
  const [isBranchNameCorrect, currBranchName] = await isCorrectBranch(repoData);
  if (!isBranchNameCorrect) {
    return console.error(`Ignoring push for ${repoData.githubRepoName} (branch name doesn't match). Expected: ${repoData.branch}, Received: ${currBranchName}`)
  }
  // Pull changes
  await pullNewestChanges(repoData)

  if (repoData.command) {
    await executeCommand(repoData.command)
  }

  console.log('Finished updating')
})

function getJSON(req) {
  return new Promise((resolve, reject) => {
    let str = "";
    req.on('data', (d) => str += d.toString('utf8'))
    req.on('end', () => resolve(JSON.parse(str)))
  })
}

function handleWebHook(payload) {
  // etc refs/heads/production
  const { ref: branchName } = payload;
  const { name: repositoryName, ssh_url: sshURL } = payload.repository;

  if (!branchName || !repositoryName || !sshURL) throw new Error('Unexpected structure of payload from webhook. ignoring.')
  // Find localRepository
  const localRepoData = config.localRepositories.find(({githubRepoName, branch}) => repositoryName === githubRepoName && branchName.endsWith(branch))
  // Push was made to none of our configured repos
  if (!localRepoData) throw new Error(`Unknown repo ${repositoryName}. ignoring.`)

  return {...localRepoData, sshURL};
}

async function pullNewestChanges (repoData) {
  const command = `cd ${repoData.root} && git pull ${repoData.sshURL} ${repoData.branch}`
  const { stdout, stderr } = await exec(command);
  console.log('Pull new changes')
  console.log('stdout:', stdout);
  console.log('stderr:', stderr);
}
/**
 * Returns true if repository is in correct branch
 */
async function isCorrectBranch (repoData) {
  const command = `cd ${repoData.root} && git rev-parse --abbrev-ref HEAD`
  const { stdout, stderr } = await exec(command);
  if (stderr) {
    return console.error(stderr)
  }
  
  return [stdout.trim() === repoData.branch, stdout]
}

async function executeCommand(command) {
  const { stdout, stderr } = await exec(command);
  console.log('stdout:', stdout);
  console.log('stderr:', stderr);
}


serv.listen(config.serverSettings.port, () => console.log(`Started server on ${config.serverSettings.port}`))
