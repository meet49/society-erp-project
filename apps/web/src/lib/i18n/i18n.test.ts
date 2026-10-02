import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from '@society-erp/shared';
import { MESSAGES, translate } from './index';
import { en } from './en';

describe('public website dictionaries', () => {
  it('every supported language has every key, with no extras and no empty strings', () => {
    const keys = Object.keys(en).sort();
    for (const locale of SUPPORTED_LOCALES) {
      const dict = MESSAGES[locale];
      expect(Object.keys(dict).sort(), `${locale} keys`).toEqual(keys);
      for (const [k, v] of Object.entries(dict)) expect(v.trim(), `${locale}.${k}`).not.toBe('');
    }
  });

  it('keeps the same placeholders in every translation', () => {
    for (const [key, template] of Object.entries(en)) {
      const expected = (template.match(/\{\w+\}/g) ?? []).sort();
      for (const locale of SUPPORTED_LOCALES) {
        const actual = (MESSAGES[locale][key as keyof typeof en].match(/\{\w+\}/g) ?? []).sort();
        expect(actual, `${locale}.${key}`).toEqual(expected);
      }
    }
  });

  it('interpolates variables and leaves unknown placeholders visible', () => {
    expect(translate('en', 'pricing.trial', { days: 14 })).toBe('14-day free trial');
    expect(translate('hi', 'contact.ticketCreated', { n: 'TKT/1' })).toBe('टिकट TKT/1 बन गया।');
    expect(translate('gu', 'pricing.billedYearly', {})).toBe('વાર્ષિક {price} બિલ');
  });
});
