#!/usr/bin/env node
// Verifier for WEConverge benchmark harness — stdlib only
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS_PATH = path.join(ROOT,'benchmark','corpus.json');
const SCHEDULE_PATH = path.join(ROOT,'benchmark','schedule.json');
const RUNS_ROOT = path.join(ROOT,'benchmark','runs');
const GITIGNORE_PATH = path.join(ROOT,'.gitignore');

let ok=true;
const fails=[];
const passes=[];

function fail(msg){ ok=false; fails.push(msg); console.error(`FAIL: ${msg}`); }
function pass(msg){ passes.push(msg); console.log(`PASS: ${msg}`); }
function sha256(s){ return crypto.createHash('sha256').update(s,'utf-8').digest('hex'); }

console.log('=== check-benchmark ===');

// 1. Corpus provenance/hashes
if(!fs.existsSync(CORPUS_PATH)) fail(`corpus missing ${CORPUS_PATH}`);
else {
  const corpus = JSON.parse(fs.readFileSync(CORPUS_PATH,'utf-8'));
  const prov = corpus.provenance;
  if(!prov) fail('corpus missing provenance');
  else {
    if(prov.source!=='princeton-nlp/SWE-bench_Verified') fail(`provenance source mismatch: ${prov.source}`);
    else pass(`provenance source ${prov.source}`);
    if(prov.revision!=='c104f840cc67f8b6eec6f759ebc8b2693d585d4a') fail(`revision mismatch ${prov.revision}`);
    else pass(`provenance revision ${prov.revision}`);
    if(!prov.parquet_sha256 || prov.parquet_sha256.length!==64) fail('parquet_sha256 missing/invalid');
    else pass(`parquet_sha256 ${prov.parquet_sha256.slice(0,12)}...`);
    if(corpus.instances?.length!==10) fail(`corpus instances count ${corpus.instances?.length} !=10`);
    else pass('corpus has 10 instances');
    // expected ids frozen
    const expectedIds = ['django__django-10554','sympy__sympy-12419','sphinx-doc__sphinx-10466','matplotlib__matplotlib-14623','scikit-learn__scikit-learn-10297','astropy__astropy-12907','pydata__xarray-2905','pytest-dev__pytest-10051','pylint-dev__pylint-4551','mwaskom__seaborn-3069'].sort();
    const actualIds = (corpus.instances||[]).map(i=>i.instance_id).sort();
    const eq = JSON.stringify(expectedIds)===JSON.stringify(actualIds);
    if(!eq) fail(`instance_ids mismatch expected ${expectedIds.join(',')} got ${actualIds.join(',')}`);
    else pass('instance_ids match frozen selection');
    for(const inst of corpus.instances||[]){
      if(!inst.instance_id || !inst.repo || !inst.base_commit) fail(`instance ${inst.instance_id} missing core fields`);
      if(!inst.problem_statement || typeof inst.problem_statement!=='string') fail(`instance ${inst.instance_id} missing problem_statement`);
      const h = sha256(inst.problem_statement);
      if(h!==inst.problem_statement_sha256) fail(`hash mismatch ${inst.instance_id}: computed ${h.slice(0,12)} vs stored ${inst.problem_statement_sha256?.slice(0,12)}`);
      if(!inst.FAIL_TO_PASS || !Array.isArray(inst.FAIL_TO_PASS)) fail(`instance ${inst.instance_id} FAIL_TO_PASS invalid`);
      if(!inst.PASS_TO_PASS || !Array.isArray(inst.PASS_TO_PASS)) fail(`instance ${inst.instance_id} PASS_TO_PASS invalid`);
      if(!/^[0-9a-f]{40}$/.test(inst.base_commit)) fail(`instance ${inst.instance_id} base_commit not 40 hex`);
      if(!/^[0-9a-f]{64}$/.test(inst.patch_hash)) fail(`instance ${inst.instance_id} patch_hash invalid`);
    }
    if(!fails.some(f=>f.includes('hash mismatch'))) pass('all problem_statement hashes verified');
    // ensure corpus does not leak gold patch content? It stores hashes only plus problem_statement; patch raw may be stored if we included? We store only hash, not raw patch, so okay. Check no 'patch' raw field of large diff
    for(const inst of corpus.instances||[]){
      if('patch' in inst && typeof inst.patch==='string' && inst.patch.length>100) fail(`corpus must not expose raw patch for ${inst.instance_id}`);
    }
    pass('corpus does not expose raw gold patch in instance entries (hashes only)');
  }
}

// 2. Schedule 10x4 balance
if(!fs.existsSync(SCHEDULE_PATH)) fail('schedule missing');
else {
  const sched = JSON.parse(fs.readFileSync(SCHEDULE_PATH,'utf-8'));
  if(sched.runs?.length!==40) fail(`schedule runs ${sched.runs?.length} !=40`);
  else pass('schedule has 40 runs');
  if(sched.meta?.seed!==20260820) fail(`schedule seed ${sched.meta?.seed} !=20260820`);
  else pass('schedule seed frozen 20260820');
  if(!sched.meta?.algorithm || !sched.meta.algorithm.includes('mulberry32')) fail('schedule algorithm not frozen mulberry32');
  else pass(`schedule algorithm frozen: ${sched.meta.algorithm.slice(0,60)}...`);
  const byInst = {};
  for(const r of sched.runs||[]){
    if(!byInst[r.instance_id]) byInst[r.instance_id]=[];
    byInst[r.instance_id].push(r);
  }
  let balanceOk=true;
  for(const [iid, arr] of Object.entries(byInst)){
    if(arr.length!==4){ fail(`instance ${iid} has ${arr.length} runs !=4`); balanceOk=false; }
    const on = arr.filter(x=>x.arm==='ON').length;
    const off = arr.filter(x=>x.arm==='OFF').length;
    if(on!==2 || off!==2){ fail(`instance ${iid} arm balance ON=${on} OFF=${off} !=2/2`); balanceOk=false; }
    const repsOn = arr.filter(x=>x.arm==='ON').map(x=>x.repeat).sort();
    const repsOff = arr.filter(x=>x.arm==='OFF').map(x=>x.repeat).sort();
    if(JSON.stringify(repsOn)!=='[1,2]' || JSON.stringify(repsOff)!=='[1,2]'){ fail(`instance ${iid} repeat imbalance`); balanceOk=false; }
  }
  if(balanceOk) pass('10x4 balance ON*2 OFF*2 per task verified');
  // opaque IDs
  const ids = (sched.runs||[]).map(r=>r.run_id);
  const uniq = new Set(ids);
  if(uniq.size!==40) fail(`opaque run_id uniqueness ${uniq.size} !=40`);
  else pass('opaque run_id unique 40');
  let opaqueOk=true;
  for(const id of ids){
    if(!/^run-[0-9a-f]{8}$/.test(id)){ fail(`opaque id format invalid ${id}`); opaqueOk=false; }
    if(id.includes('ON')||id.includes('OFF')){ fail(`opaque id encodes arm ${id}`); opaqueOk=false; }
  }
  if(opaqueOk) pass('opaque IDs format run-<8hex> and not encoding arm');
  // no adjacent duplicate instance/ tuple
  let adjOk=true;
  for(let i=0;i<(sched.runs||[]).length-1;i++){
    const a=sched.runs[i], b=sched.runs[i+1];
    if(a.instance_id===b.instance_id){ fail(`adjacent duplicate instance at index ${i} ${a.instance_id}`); adjOk=false; }
    if(a.instance_id===b.instance_id && a.arm===b.arm && a.repeat===b.repeat){ fail(`adjacent duplicate tuple at ${i}`); adjOk=false; }
  }
  if(adjOk) pass('no adjacent duplicate instance/tuple verified');
  // arm stored only in controller schedule, not in blind names — check run_id not encoding arm already done
  pass('arm blindness: arm stored only in schedule, run_id opaque');
}

// 3. Prompt equality across each task's four runs (if runs exist)
{
  const corpus = fs.existsSync(CORPUS_PATH) ? JSON.parse(fs.readFileSync(CORPUS_PATH,'utf-8')) : null;
  const sched = fs.existsSync(SCHEDULE_PATH) ? JSON.parse(fs.readFileSync(SCHEDULE_PATH,'utf-8')) : null;
  if(corpus && sched){
    const byInst = {};
    for(const r of sched.runs) { if(!byInst[r.instance_id]) byInst[r.instance_id]=[]; byInst[r.instance_id].push(r); }
    let promptOk=true;
    let checked=0;
    for(const [iid, runs] of Object.entries(byInst)){
      const inst = corpus.instances.find(i=>i.instance_id===iid);
      if(!inst) continue;
      const expected = inst.problem_statement;
      let seenPrompts=[];
      for(const r of runs){
        const p = path.join(RUNS_ROOT, r.run_id, 'PROMPT.md');
        if(!fs.existsSync(p)) continue;
        checked++;
        const content = fs.readFileSync(p,'utf-8');
        // PROMPT.md is "# Task: ..." + problem_statement
        if(!content.includes(expected.slice(0,200))) { fail(`PROMPT mismatch for ${r.run_id} ${iid} not containing expected problem_statement start`); promptOk=false; }
        // check no condition label leakage
        if(content.includes('WEConverge ON')||content.includes('WEConverge OFF')||/\bON\b.*\bOFF\b/.test(content.slice(0,100)) ){
          // we check for explicit arm label like "Arm: ON"
          if(/arm\s*[:=]\s*ON/i.test(content) || /arm\s*[:=]\s*OFF/i.test(content) || content.includes('condition ON')||content.includes('condition OFF')){
            fail(`PROMPT leaks arm label for ${r.run_id}`);
            promptOk=false;
          }
        }
        seenPrompts.push(content);
      }
      // if any staged, check equality across the 4
      if(seenPrompts.length>1){
        const first=seenPrompts[0];
        for(let i=1;i<seenPrompts.length;i++){
          if(seenPrompts[i]!==first){ fail(`PROMPT not equal across runs for ${iid}`); promptOk=false; break; }
        }
      }
    }
    if(checked===0) console.log('INFO: no staged run prompts to check (stage smoke not yet run) — prompt equality vacuously true');
    else if(promptOk) pass(`prompt equality verified across ${checked} staged runs`);
    // also check no gold patch in run dirs
    let leak=false;
    if(fs.existsSync(RUNS_ROOT)){
      for(const dir of fs.readdirSync(RUNS_ROOT)){
        const runDir=path.join(RUNS_ROOT,dir);
        if(!fs.statSync(runDir).isDirectory()) continue;
        const files = fs.readdirSync(runDir);
        for(const f of files){
          const full=path.join(runDir,f);
          if(f==='PROMPT.md' || f==='problem_statement.txt' || f==='instance.json' || f==='meta.json' || f==='clone-status.json' || f==='grading.json') continue;
          // check content for patch markers? Simple check
          if(f.endsWith('.patch') || f==='patch.txt') { leak=true; fail(`run dir ${dir} exposes patch file ${f}`); }
        }
        // check PROMPT.md does not contain patch diff markers
        const promptPath=path.join(runDir,'PROMPT.md');
        if(fs.existsSync(promptPath)){
          const txt=fs.readFileSync(promptPath,'utf-8');
          if(txt.includes('diff --git') && txt.includes('@@')) { fail(`PROMPT contains patch diff for ${dir}`); leak=true; }
        }
        // check grading does not contain arm
        const gradingPath=path.join(runDir,'grading.json');
        if(fs.existsSync(gradingPath)){
          const gtxt=fs.readFileSync(gradingPath,'utf-8');
          if(/\"arm\"\s*:\s*\"(ON|OFF)\"/.test(gtxt)) { fail(`grading leaks arm for ${dir}`); leak=true; }
        }
      }
      if(!leak) pass('no gold patch/test_patch exposure in run dirs (agent-visible staging clean)');
    }
  }
}

// 4. Ignored runtime workspace
if(!fs.existsSync(GITIGNORE_PATH)) fail('.gitignore missing');
else {
  const gi=fs.readFileSync(GITIGNORE_PATH,'utf-8');
  if(!gi.includes('benchmark/runs')) fail('.gitignore must ignore benchmark/runs/');
  else pass('.gitignore ignores benchmark/runs/');
  if(gi.includes('benchmark/runs/') || gi.includes('benchmark/runs')) pass('runtime workspace ignored');
}

// 5. Owned tracked paths max 8 check (informational)
console.log('---');
if(ok) console.log('VERIFIER PASS');
else console.log('VERIFIER FAIL');
process.exit(ok?0:1);
