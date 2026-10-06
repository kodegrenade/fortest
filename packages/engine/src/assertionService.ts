import type { ProxyResponse, Assertion, AssertionResult } from '@fortest/types';
import { selectValue, stringify } from './extractionService';

/**
 * Compares a selected value with the expected string, coercing numbers and booleans.
 */
function looselyEquals(actual: unknown, expected: string): boolean {
  if (typeof actual === 'number') return actual === Number(expected);
  if (typeof actual === 'boolean') return actual === (expected === 'true');
  return String(actual) === expected;
}

/**
 * Evaluates a single assertion against a response.
 */
export function evaluateAssertion(response: ProxyResponse, assertion: Assertion): AssertionResult {
  const { id: assertionId, target, selector, operator, expected } = assertion;
  const actual = selectValue(response, target, selector);
  const exists = actual !== undefined && actual !== null;
  const actualStr = stringify(actual) ?? 'undefined';

  // operator -> [check, failure message]. Checks are thunks so only the chosen one runs.
  const operators: Record<Assertion['operator'], [() => boolean, string]> = {
    exists: [() => exists, 'Value does not exist'],
    not_exists: [() => !exists, `Value exists: "${actualStr}"`],
    equals: [
      () => exists && looselyEquals(actual, expected),
      `Expected "${expected}" but got "${actualStr}"`,
    ],
    not_equals: [
      () => !(exists && looselyEquals(actual, expected)),
      `Expected value to not equal "${expected}"`,
    ],
    contains: [
      () => exists && actualStr.includes(expected),
      exists ? `Value does not contain "${expected}"` : 'Value does not exist',
    ],
    not_contains: [() => !exists || !actualStr.includes(expected), `Value contains "${expected}"`],
    greater_than: [
      () => exists && Number(actual) > Number(expected),
      `Expected value > ${expected} but got ${actualStr}`,
    ],
    less_than: [
      () => exists && Number(actual) < Number(expected),
      `Expected value < ${expected} but got ${actualStr}`,
    ],
    matches_regex: [
      () => exists && new RegExp(expected).test(actualStr),
      `Value does not match regular expression /${expected}/`,
    ],
  };

  let passed = false;
  let message = `Unknown operator: "${operator}"`;
  const entry = operators[operator];
  if (entry) {
    try {
      passed = entry[0]();
      message = passed ? '' : entry[1];
    } catch (err) {
      message = `Error during evaluation: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return { assertionId, passed, actual: actualStr, expected, operator, message };
}

/**
 * Evaluates a list of assertions against a response.
 */
export function evaluateAssertions(
  response: ProxyResponse,
  assertions: Assertion[],
): AssertionResult[] {
  return assertions.map((assertion) => evaluateAssertion(response, assertion));
}
