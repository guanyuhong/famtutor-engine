"""Independent paired captures. Every attempt/result is saved, not retry-to-green.

Zero hold retains the original protocol. The positive-hold experiment does not
certify compatibility and cannot replace a failed original-protocol replicate.
No source changes, network requests, credentials or paid services here: execution
uses the existing read-only browser oracle and original repository native build.
"""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from timing_probe import batch_status, trace_diagnostics, validate_hold

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]


def save(path, payload):
    raw = (json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode()
    path.write_bytes(raw)
    path.with_suffix('.sha256').write_text(hashlib.sha256(raw).hexdigest() + '  ' + path.name + '\n')


def execute(arguments, log):
    with log.open('w') as output:
        return subprocess.run(arguments, cwd=ROOT, stdout=output,
                              stderr=subprocess.STDOUT, timeout=240).returncode


def run(output, repeats, hold):
    validate_hold(hold)
    if not 1 <= repeats <= 5 or hold == 0:
        raise ValueError('Require 1..5 repeats and positive diagnostic hold')
    output.mkdir(parents=True, exist_ok=False)
    report = {'schema': 'famtutor.pointer.repeatability.v1', 'status': 'IN_PROGRESS',
              'acceptance': 'NOT_A_MERGE_GATE_OR_COMPATIBILITY_CLAIM',
              'hypothesis': 'Timing dependence unproven; positive hold is a separate diagnostic condition',
              'pairs': []}
    for delay in (0, hold):
        for iteration in range(repeats):
            folder = output / f'hold-{delay}-replicate-{iteration + 1}'
            folder.mkdir()
            pair = {'holdMs': delay, 'replicate': iteration + 1,
                    'comparisonStatus': 'NOT_RUN', 'captureComplete': False,
                    'acceptanceEligible': delay == 0, 'engines': {}}
            report['pairs'].append(pair)
            for engine, filename in [('famtutor', 'native'), ('geogebra', 'reference')]:
                target = folder / f'{filename}.json'
                command = [sys.executable, str(HERE / 'capture.py'), '--engine', engine,
                           '--output', str(target), '--diagnostic-hold-ms', str(delay)]
                result = {'command': command, 'status': 'BLOCKED'}
                pair['engines'][engine] = result
                try:
                    result['exitCode'] = execute(command, folder / f'{filename}.log')
                    if target.exists():
                        data = json.loads(target.read_text())
                        result['traceSha256'] = hashlib.sha256(target.read_bytes()).hexdigest()
                        result['diagnostics'] = trace_diagnostics(data)
                        result['status'] = data.get('status', 'BLOCKED')
                except Exception as error:
                    result['error'] = repr(error)
                save(output / 'summary.json', report)
            pair['captureComplete'] = all(r.get('exitCode') == 0 and r['status'] == 'CAPTURED'
                                          for r in pair['engines'].values())
            # Always run the original strict comparator; never replace/filter its errors.
            try:
                command = ['node', str(HERE / 'compare.mjs'), str(folder / 'native.json'),
                           str(folder / 'reference.json'), str(folder / 'comparison.json')]
                pair['comparisonExitCode'] = execute(command, folder / 'comparison.log')
                result = json.loads((folder / 'comparison.json').read_text())
                pair['comparisonStatus'] = result['status']
                pair['comparisonErrorCodes'] = [e.get('code') for e in result.get('errors', [])]
                pair['comparisonSha256'] = hashlib.sha256((folder / 'comparison.json').read_bytes()).hexdigest()
            except Exception as error:
                pair['comparisonStatus'] = 'BLOCKED'
                pair['comparisonError'] = repr(error)
            save(output / 'summary.json', report)
    report['status'] = batch_status(report['pairs'])
    save(output / 'summary.json', report)
    print(json.dumps(report, ensure_ascii=False))
    return 0 if report['status'] == 'DECLARED_REPLICATES_PASSED_NOT_MERGE_AUTHORIZATION' else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--repeats', type=int, default=3)
    parser.add_argument('--hold-ms', type=int, default=150)
    args = parser.parse_args()
    raise SystemExit(run(args.output.resolve(), args.repeats, args.hold_ms))
