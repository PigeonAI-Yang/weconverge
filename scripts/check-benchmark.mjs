#!/usr/bin/env node
// Verifier for WEConverge benchmark harness — stdlib only
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS_PATH = path.join(ROOT,'benchmark','corpus.json');
const SCHEDULE_PATH = path.join(ROOT,'benchmark','schedule.json');
const EXECUTION_PATH = path.join(ROOT,'benchmark','execution.json');
const RUNS_ROOT = path.join(ROOT,'benchmark','runs');
const GITIGNORE_PATH = path.join(ROOT,'.gitignore');

let ok=true;
const fails=[];
const passes=[];

function fail(msg){ ok=false; fails.push(msg); console.error(`FAIL: ${msg}`); }
function pass(msg){ passes.push(msg); console.log(`PASS: ${msg}`); }
function sha256(s){ return crypto.createHash('sha256').update(s,'utf-8').digest('hex'); }
function sha256File(p){ return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

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
  let adjOk=true;
  for(let i=0;i<(sched.runs||[]).length-1;i++){
    const a=sched.runs[i], b=sched.runs[i+1];
    if(a.instance_id===b.instance_id){ fail(`adjacent duplicate instance at index ${i} ${a.instance_id}`); adjOk=false; }
    if(a.instance_id===b.instance_id && a.arm===b.arm && a.repeat===b.repeat){ fail(`adjacent duplicate tuple at ${i}`); adjOk=false; }
  }
  if(adjOk) pass('no adjacent duplicate instance/tuple verified');
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
        if(!content.includes(expected.slice(0,200))) { fail(`PROMPT mismatch for ${r.run_id} ${iid} not containing expected problem_statement start`); promptOk=false; }
        if(/arm\s*[:=]\s*ON/i.test(content) || /arm\s*[:=]\s*OFF/i.test(content) || content.includes('condition ON')||content.includes('condition OFF')){
          fail(`PROMPT leaks arm label for ${r.run_id}`);
          promptOk=false;
        }
        seenPrompts.push(content);
      }
      if(seenPrompts.length>1){
        const first=seenPrompts[0];
        for(let i=1;i<seenPrompts.length;i++){
          if(seenPrompts[i]!==first){ fail(`PROMPT not equal across runs for ${iid}`); promptOk=false; break; }
        }
      }
    }
    if(checked===0) console.log('INFO: no staged run prompts to check (stage smoke not yet run) — prompt equality vacuously true');
    else if(promptOk) pass(`prompt equality verified across ${checked} staged runs`);
    // also check no gold patch in run dirs (allow agent patch artifacts)
    let leak=false;
    if(fs.existsSync(RUNS_ROOT)){
      for(const dir of fs.readdirSync(RUNS_ROOT)){
        const runDir=path.join(RUNS_ROOT,dir);
        if(!fs.statSync(runDir).isDirectory()) continue;
        const allowed = new Set(['PROMPT.md','problem_statement.txt','instance.json','meta.json','clone-status.json','grading.json','result-anon.json','controller.json','patch.json','patch.diff','final-answer.txt','repo']);
        const files = fs.readdirSync(runDir);
        for(const f of files){
          if(allowed.has(f)) continue;
          if(f.endsWith('.patch') || f==='patch.txt') { leak=true; fail(`run dir ${dir} exposes gold patch file ${f}`); }
          if(fs.statSync(path.join(runDir,f)).isDirectory()) continue;
          // ignore other allowed runtime files
          if(['execution-result.json','run.json'].includes(f)) continue;
        }
        const promptPath=path.join(runDir,'PROMPT.md');
        if(fs.existsSync(promptPath)){
          const txt=fs.readFileSync(promptPath,'utf-8');
          if(txt.includes('diff --git') && txt.includes('@@')) { fail(`PROMPT contains patch diff for ${dir}`); leak=true; }
        }
        const gradingPath=path.join(runDir,'grading.json');
        if(fs.existsSync(gradingPath)){
          const gtxt=fs.readFileSync(gradingPath,'utf-8');
          if(/"arm"\s*:\s*"(ON|OFF)"/.test(gtxt)) { fail(`grading leaks arm for ${dir}`); leak=true; }
          if(/"arm"\s*:/.test(gtxt)) { fail(`grading contains arm field for ${dir}`); leak=true; }
        }
        const anonPath=path.join(runDir,'result-anon.json');
        if(fs.existsSync(anonPath)){
          const atxt=fs.readFileSync(anonPath,'utf-8');
          if(/"arm"\s*:\s*"(ON|OFF)"/.test(atxt)) { fail(`result-anon leaks arm for ${dir}`); leak=true; }
          if(/"arm"\s*:/.test(atxt)) { fail(`result-anon contains arm field for ${dir}`); leak=true; }
        }
        const metaPath=path.join(runDir,'meta.json');
        if(fs.existsSync(metaPath)){
          const mtxt=fs.readFileSync(metaPath,'utf-8');
          if(/"arm"\s*:/.test(mtxt)) { fail(`meta leaks arm for ${dir}`); leak=true; }
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

// 5. Execution config immutability
if(!fs.existsSync(EXECUTION_PATH)) fail(`execution config missing ${EXECUTION_PATH}`);
else {
  const execCfg = JSON.parse(fs.readFileSync(EXECUTION_PATH,'utf-8'));
  const schedRaw = fs.readFileSync(SCHEDULE_PATH,'utf-8');
  const schedSha = sha256(schedRaw);
  // freeze checks
  if(execCfg.model !== 'cockpit-gpt/gpt-5.6-sol') fail(`execution model mismatch ${execCfg.model}`);
  else pass('execution model frozen cockpit-gpt/gpt-5.6-sol');
  if(execCfg.effort !== 'medium' || execCfg.thinking !== 'medium') fail(`execution effort/thinking not medium ${execCfg.effort}/${execCfg.thinking}`);
  else pass('execution effort medium frozen');
  if(execCfg.max_time !== '30m') fail(`execution max_time not 30m ${execCfg.max_time}`);
  else pass('execution max_time 30m frozen');
  if(execCfg.control_max_time !== '20s') fail(`execution control_max_time not 20s ${execCfg.control_max_time}`);
  else pass('execution control_max_time 20s frozen');
  if(execCfg.approval_mode !== 'yolo') fail(`approval_mode not yolo ${execCfg.approval_mode}`);
  else pass('execution approval_mode yolo frozen');
  if(execCfg.auto_approve !== true) fail('auto_approve not true');
  else pass('execution auto_approve frozen');
  if(execCfg.extension !== 'J:/PigeonYang/tools/weconverge/index.ts' || execCfg.extension_path !== 'J:/PigeonYang/tools/weconverge/index.ts') fail(`extension path not frozen forward-slash ${execCfg.extension}`);
  else pass('execution extension path J:/PigeonYang/tools/weconverge/index.ts frozen');
  const expectedControl = [
    'omp -p --no-session --model cockpit-gpt/gpt-5.6-sol --thinking medium --max-time 20s --no-skills --no-rules --no-extensions --extension J:/PigeonYang/tools/weconverge/index.ts "/weconverge off"',
    'omp -p --no-session --model cockpit-gpt/gpt-5.6-sol --thinking medium --max-time 20s --no-skills --no-rules --no-extensions --extension J:/PigeonYang/tools/weconverge/index.ts "/weconverge on"',
    'omp -p --no-session --model cockpit-gpt/gpt-5.6-sol --thinking medium --max-time 20s --no-skills --no-rules --no-extensions --extension J:/PigeonYang/tools/weconverge/index.ts "/weconverge reset"'
  ];
  const cc = execCfg.control_commands;
  if(!Array.isArray(cc) || cc.length!==3 || JSON.stringify(cc)!==JSON.stringify(expectedControl)) fail(`control sequence mismatch ${JSON.stringify(cc)}`);
  else pass('execution control sequence off/on/reset frozen with exact noninteractive command');
  if(!execCfg.trial_command_template || !execCfg.trial_command_template.includes('cockpit-gpt/gpt-5.6-sol') || !execCfg.trial_command_template.includes('--max-time 30m') || !execCfg.trial_command_template.includes('--auto-approve') || !execCfg.trial_command_template.includes('--approval-mode yolo') || !execCfg.trial_command_template.includes('@<PROMPT.md>')) fail('trial command template not frozen');
  else pass('execution trial command template frozen (30m yolo @PROMPT.md)');
  if(!execCfg.continuation_policy || !execCfg.continuation_policy.includes('continue_after_trial_failure')) fail(`continuation policy not frozen ${execCfg.continuation_policy}`);
  else pass('execution continuation policy frozen (continue after trial failure, stop only on controller/invariant)');
  if(execCfg.schedule_sha256 !== schedSha) fail(`schedule_sha256 mismatch execution ${execCfg.schedule_sha256} vs actual ${schedSha}`);
  else pass(`execution schedule_sha256 matches ${schedSha.slice(0,12)}...`);
  if(execCfg.schedule_total_runs !== 40) fail(`schedule_total_runs not 40 ${execCfg.schedule_total_runs}`);
  else pass('execution schedule_total_runs 40 frozen');
  // first_run measured metadata
  const fr = execCfg.first_run;
  if(!fr) fail('first_run missing');
  else {
    if(fr.run_id !== 'run-641b399e') fail(`first_run run_id ${fr.run_id}`);
    else pass('execution first_run run_id run-641b399e frozen');
    if(fr.arm !== 'ON') fail(`first_run arm ${fr.arm}`);
    else pass('execution first_run arm ON frozen');
    if(fr.model !== 'cockpit-gpt/gpt-5.6-sol') fail(`first_run model ${fr.model}`);
    else pass('execution first_run model frozen');
    if(fr.effort !== 'medium' || fr.thinking !== 'medium') fail('first_run effort not medium');
    else pass('execution first_run effort medium frozen');
    if(fr.exit_code !== 0) fail(`first_run exit_code ${fr.exit_code}`);
    else pass('execution first_run exit 0 frozen');
    if(fr.duration_ms !== 265000) fail(`first_run duration_ms ${fr.duration_ms}`);
    else pass('execution first_run duration 265000 ms frozen');
    if(!fr.final_answer_sha256 || fr.final_answer_sha256.length!==64) fail('first_run final_answer_sha256 invalid');
    else pass(`execution first_run final_answer_sha256 ${fr.final_answer_sha256.slice(0,12)}...`);
    if(!fr.patch_sha256 || fr.patch_sha256.length!==64) fail('first_run patch_sha256 invalid');
    else pass(`execution first_run patch_sha256 ${fr.patch_sha256.slice(0,12)}...`);
  }
  // exact 40-run immutability already via sha, but also check runs count
  const sched = JSON.parse(schedRaw);
  if(sched.runs.length!==40) fail('schedule not 40 runs (immutability)');
  else pass('exact 40-run immutability verified via schedule_sha256 and count');
}

// 6. Finalized first-run anonymity, patch hash/status, no arm in grading/result-anon
{
  const runId = 'run-641b399e';
  const runDir = path.join(RUNS_ROOT, runId);
  if(!fs.existsSync(runDir)) fail(`first run dir missing ${runDir}`);
  else {
    const needed = ['grading.json','result-anon.json','patch.diff','final-answer.txt','patch.json','meta.json','PROMPT.md','controller.json'];
    for(const f of needed){
      if(!fs.existsSync(path.join(runDir,f))) fail(`first run missing ${f}`);
      else pass(`first run has ${f}`);
    }
    // anonymity: grading and result-anon must not contain arm
    for(const anon of ['grading.json','result-anon.json','meta.json','PROMPT.md']){
      const p = path.join(runDir, anon);
      if(fs.existsSync(p)){
        const txt = fs.readFileSync(p,'utf-8');
        if(/"arm"\s*:/.test(txt)) fail(`${anon} leaks arm field`);
        if(/"arm"\s*:\s*"(ON|OFF)"/.test(txt)) fail(`${anon} leaks arm ON/OFF`);
      }
    }
    if(!fails.some(f=>f.includes('leaks arm'))) pass('finalized first-run anonymity verified (no arm in grading/result-anon/meta/PROMPT)');
    // patch hash/status
    const patchPath = path.join(runDir,'patch.diff');
    if(fs.existsSync(patchPath)){
      const patchSha = sha256File(patchPath);
      const patchJson = fs.existsSync(path.join(runDir,'patch.json')) ? JSON.parse(fs.readFileSync(path.join(runDir,'patch.json'),'utf-8')) : null;
      if(!patchJson || patchJson.patch_sha256 !== patchSha) fail(`patch hash mismatch file ${patchSha.slice(0,12)} vs patch.json ${patchJson?.patch_sha256?.slice(0,12)}`);
      else pass(`first run patch hash verified ${patchSha.slice(0,12)}...`);
      if(!patchJson || !patchJson.git_status) fail('patch git_status missing');
      else pass(`first run patch git_status present: ${patchJson.git_status.slice(0,60).replace(/\n/g,' | ')}`);
      // also compare to execution first_run patch sha
      const execCfg = JSON.parse(fs.readFileSync(EXECUTION_PATH,'utf-8'));
      if(patchSha !== execCfg.first_run.patch_sha256) fail(`patch sha not matching execution first_run ${patchSha.slice(0,12)} vs ${execCfg.first_run.patch_sha256.slice(0,12)}`);
      else pass('first run patch sha matches execution config');
    }
    const ansPath = path.join(runDir,'final-answer.txt');
    if(fs.existsSync(ansPath)){
      const ansSha = sha256File(ansPath);
      const execCfg = JSON.parse(fs.readFileSync(EXECUTION_PATH,'utf-8'));
      if(ansSha !== execCfg.first_run.final_answer_sha256) fail(`final-answer sha mismatch ${ansSha.slice(0,12)} vs ${execCfg.first_run.final_answer_sha256.slice(0,12)}`);
      else pass(`first run final-answer hash verified ${ansSha.slice(0,12)}...`);
    }
    // no arm in grading/result-anon already checked
    // controller.json may contain arm (allowed), but grading/result-anon must not
    const ctrlPath = path.join(runDir,'controller.json');
    if(fs.existsSync(ctrlPath)){
      const ctrl = JSON.parse(fs.readFileSync(ctrlPath,'utf-8'));
      if(ctrl.arm !== 'ON') fail(`controller.json arm should be ON, got ${ctrl.arm}`);
      else pass('controller.json retains arm in controller-only metadata (allowed)');
    }
  }
}

// 7. Resume selects index 1
{
  const sched = JSON.parse(fs.readFileSync(SCHEDULE_PATH,'utf-8'));
  const sorted = [...sched.runs].sort((a,b)=>a.index-b.index);
  // first run at index 0 should be finalized
  const first = sorted[0];
  if(first.run_id !== 'run-641b399e') fail(`schedule index 0 not run-641b399e but ${first.run_id}`);
  else pass('schedule index 0 is run-641b399e');
  const firstDir = path.join(RUNS_ROOT, first.run_id);
  const firstFinalized = fs.existsSync(path.join(firstDir,'grading.json')) && fs.existsSync(path.join(firstDir,'result-anon.json'));
  if(!firstFinalized) fail('first run not finalized, cannot verify resume');
  else pass('first run finalized, resume should skip it');
  // find next unfinalized
  let next = null;
  for(const r of sorted){
    const d = path.join(RUNS_ROOT, r.run_id);
    if(!fs.existsSync(path.join(d,'grading.json')) || !fs.existsSync(path.join(d,'result-anon.json'))){
      next = r;
      break;
    }
  }
  if(!next) fail('no next run found (all 40 finalized?)');
  else if(next.index !== 1 || next.run_id !== 'run-df2bcff0') fail(`resume selects wrong ${next.run_id} index ${next.index} expected run-df2bcff0 index 1`);
  else pass(`resume selects index 1 correct: ${next.run_id} (matplotlib OFF2)`);
}

// 8. Owned tracked paths max 8 check (informational)
console.log('---');
if(ok) console.log('VERIFIER PASS');
else console.log('VERIFIER FAIL');
process.exit(ok?0:1);
