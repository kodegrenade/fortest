import type { ProxyResponse, Assertion } from '@fortest/types';
import { resolveDotPath } from './extractionService';

export interface AssertionResult {
  assertionId: string;
  passed: boolean;
  actual: string;
  expected: string;
  operator: string;
  message: string;
}

/**
 * Coerces and compares two values for equality.
 */
function evaluateEquals(actual: any, expected: string): boolean {
  if (actual === undefined || actual === null) return false;
  
  if (typeof actual === 'number') {
    return actual === Number(expected);
  }
  if (typeof actual === 'boolean') {
    return actual === (expected === 'true');
  }
  return String(actual) === expected;
}

/**
 * Evaluates a single assertion against a proxy response.
 */
export function evaluateAssertion(
  response: ProxyResponse,
  assertion: Assertion
): AssertionResult {
  const { id: assertionId, target, selector, operator, expected } = assertion;
  
  let actualRaw: any = undefined;
  
  // 1. Extract actual value
  if (target === 'status') {
    actualRaw = response.status;
  } else if (target === 'response_time') {
    actualRaw = response.time;
  } else if (target === 'header') {
    const headers = response.headers;
    const lowerSelector = selector.toLowerCase();
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === lowerSelector) {
        actualRaw = headers[key];
        break;
      }
    }
  } else if (target === 'body') {
    if (!selector || selector === 'body' || selector === 'response.body') {
      actualRaw = response.body;
    } else {
      try {
        const parsedBody = JSON.parse(response.body);
        actualRaw = resolveDotPath(parsedBody, selector);
      } catch {
        actualRaw = undefined;
      }
    }
  }

  // Convert actual raw value to string representation for reporting
  let actualStr = 'undefined';
  if (actualRaw !== undefined && actualRaw !== null) {
    actualStr = typeof actualRaw === 'object' ? JSON.stringify(actualRaw) : String(actualRaw);
  }

  let passed = false;
  let error: string | null = null;

  // 2. Evaluate operator
  try {
    switch (operator) {
      case 'exists':
        passed = actualRaw !== undefined && actualRaw !== null;
        if (!passed) error = 'Value does not exist';
        break;
        
      case 'not_exists':
        passed = actualRaw === undefined || actualRaw === null;
        if (!passed) error = `Value exists: "${actualStr}"`;
        break;
        
      case 'equals':
        passed = evaluateEquals(actualRaw, expected);
        if (!passed) error = `Expected "${expected}" but got "${actualStr}"`;
        break;
        
      case 'not_equals':
        passed = !evaluateEquals(actualRaw, expected);
        if (!passed) error = `Expected value to not equal "${expected}"`;
        break;
        
      case 'contains':
        if (actualRaw === undefined || actualRaw === null) {
          passed = false;
          error = 'Value does not exist';
        } else {
          const actualString = typeof actualRaw === 'object' ? JSON.stringify(actualRaw) : String(actualRaw);
          passed = actualString.includes(expected);
          if (!passed) error = `Value does not contain "${expected}"`;
        }
        break;
        
      case 'not_contains':
        if (actualRaw === undefined || actualRaw === null) {
          passed = true;
        } else {
          const actualString = typeof actualRaw === 'object' ? JSON.stringify(actualRaw) : String(actualRaw);
          passed = !actualString.includes(expected);
          if (!passed) error = `Value contains "${expected}"`;
        }
        break;
        
      case 'greater_than':
        if (actualRaw === undefined || actualRaw === null) {
          passed = false;
          error = 'Value is undefined';
        } else {
          passed = Number(actualRaw) > Number(expected);
          if (!passed) error = `Expected value > ${expected} but got ${actualStr}`;
        }
        break;
        
      case 'less_than':
        if (actualRaw === undefined || actualRaw === null) {
          passed = false;
          error = 'Value is undefined';
        } else {
          passed = Number(actualRaw) < Number(expected);
          if (!passed) error = `Expected value < ${expected} but got ${actualStr}`;
        }
        break;
        
      case 'matches_regex':
        if (actualRaw === undefined || actualRaw === null) {
          passed = false;
          error = 'Value is undefined';
        } else {
          const regex = new RegExp(expected);
          passed = regex.test(String(actualRaw));
          if (!passed) error = `Value does not match regular expression /${expected}/`;
        }
        break;
        
      default:
        passed = false;
        error = `Unknown operator: "${operator}"`;
    }
  } catch (err: any) {
    passed = false;
    error = `Error during evaluation: ${err.message || err}`;
  }

  return {
    assertionId,
    passed,
    actual: actualStr,
    expected,
    operator,
    message: error || '',
  };
}

/**
 * Evaluates a list of assertions against a proxy response.
 */
export function evaluateAssertions(
  response: ProxyResponse,
  assertions: Assertion[]
): AssertionResult[] {
  return assertions.map((assertion) => evaluateAssertion(response, assertion));
}
