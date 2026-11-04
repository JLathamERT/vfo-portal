// The repo guard (docs/plans/two-person-workflow/README.md, part 3). The same file
// sits in both repos. Claude Code runs it before a chat's shell commands, file
// edits and Supabase deploys. It has two jobs:
//
// 1. Button check, always on. A push that changes the button (anything under
//    .github/) or this guard brings up a permission prompt. GitHub's free plan
//    can't limit the live key to main, so an edited copy of the button on a branch
//    could otherwise use it. A chat can't answer the prompt for itself. Anything
//    the guard can't work out also prompts.
// 2. Deploy block. No chat deploys the backend to live or names no project
//    (supabase/.temp/project-ref is tracked and points at live). Staging is fine.
//    Off only through DEPLOY_BLOCK_ON below or the switch: if the button
//    breaks, a person creates ~/.vfo-deploy-guard-off in their own terminal, which
//    turns this job off on that computer. Chats never create that file.
//
// This stops mistakes by chats. It does not stop a person's own terminal, or a
// chat set on removing the guard.

import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const DEPLOY_BLOCK_ON = true
const OFF_SWITCH = '.vfo-deploy-guard-off'
const STAGING_REF = 'yxolcioazczlhruprmrb'

const BUTTON_PATHS = [/^\.github\//, /^\.claude\/hooks\/deploy-guard/, /^\.claude\/settings(\.local)?\.json$/]
const GUARD_NAMES = /deploy-guard|\.vfo-deploy-guard-off|disableAllHooks|\.claude[\\/]settings(\.local)?\.json/
const SHELLS = /^(bash|sh|zsh|powershell|pwsh|cmd)(\.exe)?$/i

const ASK_WORD = 'Only say yes if Jake has given his word for this in the chat.'
const DEPLOY_REFUSAL = 'Live is released with the deploy button, not from a chat: say "deploy" and Claude presses it. Test deploys must name the staging project with --project-ref ' + STAGING_REF + '.'

function answer(permissionDecision, permissionDecisionReason) {
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision, permissionDecisionReason } }))
  process.exit(0)
}

function deployBlockActive() {
  return DEPLOY_BLOCK_ON && !existsSync(join(homedir(), OFF_SWITCH))
}

// Words of one simple command, keeping quoted text together.
function tokenize(text) {
  const words = []
  let word = ''
  let quote = null
  let started = false
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null
      else word += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
      started = true
    } else if (/\s/.test(ch)) {
      if (started || word) words.push(word)
      word = ''
      started = false
    } else {
      word += ch
    }
  }
  if (started || word) words.push(word)
  return words
}

// A command line split at ; && || | & and new lines, outside quotes.
function splitCommands(text) {
  const clean = text.replace(/\d*>&\d+/g, ' ').replace(/\d*>>?\s*[^\s;&|]+/g, ' ')
  const parts = []
  let part = ''
  let quote = null
  for (const ch of clean) {
    if (quote) {
      if (ch === quote) quote = null
      part += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
      part += ch
    } else if (ch === ';' || ch === '&' || ch === '|' || ch === '\n') {
      parts.push(part)
      part = ''
    } else {
      part += ch
    }
  }
  parts.push(part)
  return parts.map(p => p.trim()).filter(Boolean)
}

const baseName = word => word.split(/[\\/]/).pop()
const isUnresolved = path => /[$`%(]/.test(path)

function checkDeploy(words) {
  const at = words.findIndex((w, i) => w === 'functions' && words[i + 1] === 'deploy')
  if (at < 0 || !words.slice(0, at).some(w => /^supabase(\.exe)?(@.*)?$/i.test(baseName(w)))) return
  const flag = words.findIndex(w => w === '--project-ref' || w.startsWith('--project-ref='))
  const ref = flag < 0 ? null : words[flag].includes('=') ? words[flag].split('=')[1] : words[flag + 1]
  if (ref !== STAGING_REF && deployBlockActive()) answer('deny', DEPLOY_REFUSAL)
}

// The folder and arguments of a `git push`, or null if these words aren't one.
function parsePush(words, cwd) {
  const at = words.findIndex(w => /^git(\.exe)?$/i.test(baseName(w)))
  if (at < 0) return null
  let dir = cwd
  let i = at + 1
  for (; i < words.length; i++) {
    if (words[i] === '-C') dir = resolve(dir, words[++i] ?? '')
    else if (words[i] === '-c') i++
    else if (!words[i].startsWith('-')) break
  }
  if (words[i] !== 'push') return null
  return { dir, args: words.slice(i + 1), unknownDir: words.slice(at, i).some(isUnresolved) }
}

function changesButton(dir, source) {
  const out = execFileSync('git', ['-C', dir, 'diff', '--name-only', `origin/main...${source}`], { encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] })
  return out.split(/\r?\n/).filter(name => BUTTON_PATHS.some(p => p.test(name)))
}

function checkPush(words, cwd, cwdKnown) {
  const push = parsePush(words, cwd)
  if (!push) return
  const unsure = why => answer('ask', `The guard can't tell whether this push changes the deploy button (${why}). ${ASK_WORD}`)
  if (push.unknownDir || !cwdKnown) unsure('it can\'t work out which folder this runs in')

  const flags = push.args.filter(a => a.startsWith('-'))
  if (flags.some(f => /^--(all|mirror|tags|branches|follow-tags)$/.test(f))) unsure(`it pushes with ${flags.join(' ')}`)
  const deleting = flags.includes('--delete') || flags.includes('-d')
  if (deleting) return
  const valueFlag = /^(--repo|--receive-pack|--exec|--push-option|-o)$/
  if (flags.some(f => valueFlag.test(f))) unsure(`it pushes with ${flags.join(' ')}`)

  const positional = push.args.filter(a => !a.startsWith('-'))
  const sources = positional.slice(1).map(spec => spec.replace(/^\+/, '').split(':')[0]).filter(Boolean)
  if (positional.slice(1).some(spec => isUnresolved(spec))) unsure('a branch name is a variable')

  let changed
  try {
    changed = (sources.length ? sources : ['HEAD']).flatMap(source => changesButton(push.dir, source))
  } catch {
    unsure('git could not compare it to main')
  }
  if (changed.length) answer('ask', `This push changes the deploy button or its guard: ${changed.slice(0, 5).join(', ')}. ${ASK_WORD}`)
}

// gh api can write files and commits without a git push.
function checkGhApi(words) {
  const at = words.findIndex(w => /^gh(\.exe)?$/i.test(baseName(w)))
  if (at < 0 || words[at + 1] !== 'api') return
  const args = words.slice(at + 2)
  const method = args.findIndex(a => a === '-X' || a === '--method')
  const writes = (method >= 0 && !/^get$/i.test(args[method + 1] ?? ''))
    || args.some(a => /^(-X[A-Za-z]|--method=(?!get)|-f|-F|--field|--raw-field|--input)/i.test(a))
  if (writes && args.some(a => /\/(contents|git)\//.test(a))) {
    answer('ask', `This writes to a repo through gh api, which could change the deploy button. ${ASK_WORD}`)
  }
}

function checkShell(text, cwd) {
  let dir = cwd
  let dirKnown = true
  for (const part of splitCommands(text)) {
    const words = tokenize(part)
    if (!words.length) continue
    if (/^(cd|set-location|sl|pushd|chdir)$/i.test(words[0])) {
      const target = words.filter((w, i) => i > 0 && !w.startsWith('-')).pop() ?? ''
      if (!target || isUnresolved(target)) dirKnown = false
      else dir = resolve(dir, target)
      continue
    }
    // A shell run inside this command: check what it was told to run.
    if (SHELLS.test(baseName(words[0]))) {
      const at = words.findIndex((w, i) => i > 0 && /^(-c|\/c|-command)$/i.test(w))
      if (at >= 0) checkShell(words.slice(at + 1).join(' '), dir)
    }
    checkDeploy(words)
    checkPush(words, dir, dirKnown)
    checkGhApi(words)
  }
}

function main() {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}')
  const tool = input.tool_name ?? ''
  const toolInput = input.tool_input ?? {}

  if (/deploy_edge_function$/.test(tool)) {
    if (toolInput.project_id !== STAGING_REF && deployBlockActive()) answer('deny', DEPLOY_REFUSAL)
    return
  }
  if (tool === 'Write' || tool === 'Edit' || tool === 'NotebookEdit') {
    const path = String(toolInput.file_path ?? toolInput.notebook_path ?? '')
    if (GUARD_NAMES.test(path)) answer('ask', `This edits the deploy guard or its settings. ${ASK_WORD}`)
    return
  }
  if (tool === 'Bash' || tool === 'PowerShell') {
    const command = String(toolInput.command ?? '')
    if (GUARD_NAMES.test(command)) answer('ask', `This command touches the deploy guard or its settings. ${ASK_WORD}`)
    checkShell(command, input.cwd ?? process.cwd())
  }
}

try {
  main()
} catch (error) {
  answer('ask', `The deploy guard hit an error (${error.message}). ${ASK_WORD}`)
}
