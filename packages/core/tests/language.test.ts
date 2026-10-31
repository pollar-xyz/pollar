// Which language the modals show: the dashboard's pin, then the app's code, then
// the device; and how a localized text falls back when a language is missing.
// Run with `npm test` in packages/core (or `npm run test:unit` at the root).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PollarClient } from '../src/index';
import { COUNTRY_NAMES } from '../src/lib/country-names.generated';
import { countryName, languageFromTag, localizedText, resolveLanguage } from '../src/lib/language';

test('a BCP 47 tag maps to a modal language by its base', () => {
  assert.equal(languageFromTag('pt-BR'), 'pt');
  assert.equal(languageFromTag('es_AR'), 'es');
  assert.equal(languageFromTag('EN'), 'en');
  assert.equal(languageFromTag('fr-FR'), null);
  assert.equal(languageFromTag(undefined), null);
});

test('the dashboard pin wins; device in the dashboard defers to the code, then the device', () => {
  assert.equal(resolveLanguage({ dashboard: 'pt', code: ['es'], device: 'en-US' }), 'pt');
  assert.equal(resolveLanguage({ dashboard: 'device', code: [undefined, 'es-MX'], device: 'pt-BR' }), 'es');
  assert.equal(resolveLanguage({ dashboard: 'device', code: ['pt', 'es'], device: 'en' }), 'pt');
  assert.equal(resolveLanguage({ code: ['fr'], device: 'pt-BR' }), 'pt');
  assert.equal(resolveLanguage({ device: 'de-DE' }), 'en');
});

test('a missing translation falls back: pt to es, then en', () => {
  assert.equal(localizedText({ en: 'City', es: 'Ciudad', pt: 'Cidade' }, 'pt'), 'Cidade');
  assert.equal(localizedText({ en: 'City', es: 'Ciudad' }, 'pt'), 'Ciudad');
  assert.equal(localizedText({ en: 'City' }, 'pt'), 'City');
  assert.equal(localizedText({ es: 'Ciudad', pt: 'Cidade' }, 'en'), 'Ciudad');
  assert.equal(localizedText(undefined, 'es'), '');
});

test('setLocale changes the locale and tells the subscribers once per change', () => {
  const client = new PollarClient({ apiKey: 'pub_testnet_probe', locale: 'es', logLevel: 'silent' });
  const seen: Array<string | undefined> = [];
  const unsubscribe = client.onLocaleChange((locale) => seen.push(locale));
  assert.equal(client.getLocale(), 'es', 'config.locale is the starting value');
  client.setLocale('pt-BR');
  client.setLocale('pt-BR');
  client.setLocale(undefined);
  assert.deepEqual(seen, ['pt-BR', undefined], 'no replay on subscribe, nothing for an unchanged value');
  unsubscribe();
  client.setLocale('en');
  assert.deepEqual(seen, ['pt-BR', undefined]);
  assert.equal(client.getLocale(), 'en');
  client.destroy();
});

test('a country is named in the language asked, by Intl or, without it, by the table', () => {
  assert.equal(countryName('BO', 'en'), 'Bolivia');
  assert.equal(countryName('bo', 'pt'), 'Bolívia');
  assert.equal(countryName('BR', 'es'), 'Brasil');
  const displayNames = Intl.DisplayNames;
  // Hermes ships no Intl.DisplayNames.
  Object.defineProperty(Intl, 'DisplayNames', { value: undefined, configurable: true, writable: true });
  try {
    assert.equal(countryName('BO', 'pt'), 'Bolívia');
    assert.equal(countryName('MX', 'es'), 'México');
    assert.equal(countryName('ZZ9', 'en'), 'ZZ9', 'a code neither knows shows as it came');
  } finally {
    Object.defineProperty(Intl, 'DisplayNames', { value: displayNames, configurable: true, writable: true });
  }
});

test('the country table has every alpha-2 code with a name in each language', () => {
  const codes = Object.keys(COUNTRY_NAMES);
  assert.ok(codes.length > 240, `${codes.length} regions`);
  for (const code of codes) {
    assert.match(code, /^[A-Z]{2}$/);
    for (const name of COUNTRY_NAMES[code]!) assert.ok(name.length > 0, code);
  }
});
