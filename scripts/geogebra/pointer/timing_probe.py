"""Read-only timing diagnostics. Never dispatch extra input or certify parity.

The normal collector's two-frame boundary is retained. An optional passive hold
adds a separately labelled observation AFTER that boundary. Such a hold changes
input cadence, so those traces are ineligible for the original acceptance gate.
"""
import math


def validate_hold(milliseconds):
    if type(milliseconds) is not int or not 0 <= milliseconds <= 500:
        raise ValueError('Diagnostic hold must be an integer from 0 to 500 ms')
    return milliseconds


def timing_contract(milliseconds):
    validate_hold(milliseconds)
    return {
        'postSampleHoldMs': milliseconds,
        'originalProtocolEligible': milliseconds == 0,
        'purpose': 'TIMING_DIAGNOSTIC_ONLY' if milliseconds else 'DECLARED_PROTOCOL',
        'eventPolicy': 'All original samples and ordered raw callbacks retained; no retries or replacement samples',
    }


def observe_after_hold(page, step, milliseconds):
    """No-op at zero; the expression only waits and reads public observations."""
    validate_hold(milliseconds)
    if milliseconds == 0:
        return None
    result = page.evaluate('''async milliseconds => {
        const before = performance.now();
        await new Promise(resolve => setTimeout(resolve, milliseconds));
        return {before, after:performance.now(), state:pointerRecord.state(),
          publicEventCount:pointerRecord.trace.publicEvents.length,
          domEventCount:pointerRecord.trace.rawDOM.length};
    }''', milliseconds)
    if any(type(result.get(k)) not in (int, float) or not math.isfinite(result[k])
           for k in ('before', 'after')) or result['after'] < result['before']:
        raise ValueError('Invalid diagnostic monotonic clock')
    return {'step': step, 'requestedHoldMs': milliseconds, **result}


def trace_diagnostics(trace):
    """Indexes/summaries point back to original arrays; they never modify them."""
    if not isinstance(trace, dict) or not isinstance(trace.get('samples'), list):
        raise ValueError('Trace samples missing')
    events = trace.get('publicEvents')
    raw = trace.get('rawDOM')
    if not isinstance(events, list) or not isinstance(raw, list):
        raise ValueError('Trace channels missing')
    late_by_step = {row['step']: row for row in trace.get('lateObservations', [])}
    rows = []
    previous = None
    for sample in trace['samples']:
        step = sample['step']
        delivered = [(i, e) for i, e in enumerate(raw)
                     if e.get('step') == step and e.get('type') in ('pointerdown', 'pointermove', 'pointerup')]
        late = late_by_step.get(step)
        current = delivered[-1][1].get('time') if delivered else None
        rows.append({
            'step': step,
            'rawInputIndexes': [i for i, _ in delivered],
            'publicCallbackIndexes': [i for i, e in enumerate(events) if e.get('step') == step],
            'inputIntervalMs': current - previous if current is not None and previous is not None else None,
            'earlyPublicEventCount': sample.get('publicEventCount'),
            'latePublicEventCount': late.get('publicEventCount') if late else None,
            'stateChangedWithoutNewInput': sample['state'] != late['state'] if late else None,
        })
        if current is not None:
            previous = current
    return {'status': trace.get('status'), 'sourceSha': trace.get('sourceSha'),
            'sourceTree': trace.get('sourceTree'), 'timing': trace.get('timingProbe'),
            'samples': len(trace['samples']), 'rawDOMEvents': len(raw),
            'publicCallbacks': len(events), 'boundaries': rows}


def batch_status(pairs):
    """A later passing replicate cannot erase any earlier declared failure."""
    declared = [p for p in pairs if p['holdMs'] == 0]
    if not declared or any(p.get('captureComplete') is not True for p in pairs):
        return 'BLOCKED'
    if any(p.get('comparisonStatus') != 'PASSED' for p in declared):
        return 'FAILED'
    return 'DECLARED_REPLICATES_PASSED_NOT_MERGE_AUTHORIZATION'
