import copy
import unittest
from timing_probe import validate_hold, timing_contract, observe_after_hold, trace_diagnostics, batch_status


class Page:
    def __init__(self, result=None):
        self.calls = []
        self.result = result or {'before': 10, 'after': 160, 'state': {'x': 1},
                                 'publicEventCount': 3, 'domEventCount': 7}

    def evaluate(self, script, *args):
        self.calls.append((script, args))
        return self.result


class TimingProbeTests(unittest.TestCase):
    def test_bounded_integer_hold(self):
        for value in [0, 1, 150, 500]:
            self.assertEqual(validate_hold(value), value)
        for value in [-1, 501, True, 1.5, float('nan'), '150', None]:
            with self.assertRaises(ValueError):
                validate_hold(value)

    def test_default_is_exact_no_op(self):
        page = Page()
        self.assertIsNone(observe_after_hold(page, 'step', 0))
        self.assertEqual(page.calls, [])
        self.assertTrue(timing_contract(0)['originalProtocolEligible'])

    def test_delayed_probe_is_explicitly_ineligible(self):
        self.assertFalse(timing_contract(150)['originalProtocolEligible'])
        self.assertEqual(timing_contract(150)['purpose'], 'TIMING_DIAGNOSTIC_ONLY')
        page = Page()
        row = observe_after_hold(page, 'out-2', 150)
        self.assertEqual(row['step'], 'out-2')
        self.assertEqual(row['requestedHoldMs'], 150)
        self.assertEqual(page.calls[0][1], (150,))
        for forbidden in ['setCoords', 'setValue', 'evalCommand', 'dispatchEvent', 'mouse.move']:
            self.assertNotIn(forbidden, page.calls[0][0])

    def test_invalid_clock_rejected(self):
        for before, after in [(2, 1), (1, float('nan')), ('1', 2)]:
            with self.assertRaises(ValueError):
                observe_after_hold(Page({'before': before, 'after': after}), 'x', 150)

    def test_summaries_retain_every_callback_index_without_mutation(self):
        trace = {'samples': [{'step': 's', 'state': {'x': 1}, 'publicEventCount': 2}],
                 'rawDOM': [{'step': 's', 'type': 'pointermove', 'time': 4}],
                 'publicEvents': [{'step': 's'}, {'step': 's'}],
                 'lateObservations': [{'step': 's', 'state': {'x': 2}, 'publicEventCount': 3}]}
        original = copy.deepcopy(trace)
        report = trace_diagnostics(trace)
        self.assertEqual(report['boundaries'][0]['publicCallbackIndexes'], [0, 1])
        self.assertTrue(report['boundaries'][0]['stateChangedWithoutNewInput'])
        self.assertEqual(trace, original)

    def test_missing_channels_not_interpreted_as_no_events(self):
        with self.assertRaises(ValueError):
            trace_diagnostics({'samples': []})

    def test_later_success_cannot_erase_declared_failure(self):
        pairs = [{'holdMs': 0, 'captureComplete': True, 'comparisonStatus': 'FAILED'},
                 {'holdMs': 0, 'captureComplete': True, 'comparisonStatus': 'PASSED'},
                 {'holdMs': 150, 'captureComplete': True, 'comparisonStatus': 'PASSED'}]
        self.assertEqual(batch_status(pairs), 'FAILED')

    def test_diagnostic_only_cannot_certify_declared_protocol(self):
        self.assertEqual(batch_status([{'holdMs': 150, 'captureComplete': True,
                                       'comparisonStatus': 'PASSED'}]), 'BLOCKED')

    def test_incomplete_capture_is_blocker_even_with_green_comparison(self):
        self.assertEqual(batch_status([{'holdMs': 0, 'captureComplete': False,
                                       'comparisonStatus': 'PASSED'}]), 'BLOCKED')

    def test_passing_replicates_do_not_authorize_merge(self):
        self.assertEqual(batch_status([{'holdMs': 0, 'captureComplete': True,
                                       'comparisonStatus': 'PASSED'}]),
                         'DECLARED_REPLICATES_PASSED_NOT_MERGE_AUTHORIZATION')


if __name__ == '__main__':
    unittest.main(verbosity=2)
