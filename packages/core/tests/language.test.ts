// Which language the modals show: the dashboard's pin, then the app's code, then
// the device; and how a localized text falls back when a language is missing.
// Run with `npm test` in packages/core (or `npm run test:unit` at the root).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { languageFromTag, localizedText, resolveLanguage } from '../src/lib/language';

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
