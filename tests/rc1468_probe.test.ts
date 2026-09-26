// RC1-468 probe: a failing test must fail CI under the dd-trace reporter
// plus --coverage together. Deleted before merge; exists only to prove the
// exit code on this branch.
import { test, expect } from 'vitest'

test('rc1-468 exit-code probe', () => {
  expect('this run', 'RC1-468 exit-code probe — must be red').toBe('red')
})
