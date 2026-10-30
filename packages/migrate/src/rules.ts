import ts from 'typescript';
import { TARGET_EXPORTS } from './exports.generated';
import type { Severity, TextEdit } from './types';

export interface RuleSpec {
  id: string;
  since: string;
  severity: Severity;
  /** Anchor in the upgrade guide. */
  docs: string;
}

/** A change one rule asks for. With `edits` the tool can make it. */
export interface RawFinding {
  spec: RuleSpec;
  pos: number;
  message: string;
  edits?: TextEdit[];
}

const rule = (id: string, since: string, severity: Severity, docs: string): RuleSpec => ({ id, since, severity, docs });

export const RULES = {
  contextRenames: rule('react-context-renames', '0.6.0', 'error', 'react-context-renames'),
  contextWallet: rule('context-wallet-fields', '0.10.0', 'error', 'wallet-address-and-type'),
  sessionPublicKey: rule('session-wallet-public-key', '0.9.0', 'error', 'wallet-address-and-type'),
  custodialType: rule('custodial-wallet-type', '0.9.0', 'warning', 'wallet-address-and-type'),
  adapterTypes: rule('adapter-type-renames', '0.7.0', 'error', 'adapter-types'),
  profileData: rule('session-profile-data', '0.7.0', 'error', 'session-data-and-user-profile'),
  storageKey: rule('session-storage-key', '0.7.0', 'error', 'session-data-and-user-profile'),
  providerConfig: rule('provider-config-prop', '0.8.0', 'error', 'provider-props'),
  providerStyles: rule('provider-styles-prop', '0.8.0', 'error', 'provider-props'),
  renderWallets: rule('provider-render-wallets', '0.10.0', 'error', 'external-wallets'),
  loginWallet: rule('login-wallet', '0.10.0', 'error', 'external-wallets'),
  walletAdapterArray: rule('wallet-adapter-array', '0.10.0', 'error', 'external-wallets'),
  kitFactory: rule('stellar-wallets-kit-factory', '0.10.0', 'error', 'external-wallets'),
  kitPicker: rule('stellar-wallets-kit-picker', '0.10.0', 'error', 'external-wallets'),
  kitNetwork: rule('stellar-wallets-kit-network', '0.8.0', 'error', 'external-wallets'),
  customAdapter: rule('custom-wallet-adapter', '0.10.0', 'warning', 'external-wallets'),
  txSteps: rule('transaction-state-steps', '0.7.2', 'warning', 'transactions'),
  balanceNullable: rule('balance-nullable', '0.11.1', 'warning', 'balances'),
  trustlineSponsored: rule('trustline-sponsored-flag', '0.11.1', 'error', 'trustlines'),
  kycPolling: rule('kyc-poll-status', '0.11.4', 'info', 'kyc'),
  ramps: rule('ramps-v3', '0.12.0', 'error', 'ramps'),
  cosign: rule('cosign-removed', '0.12.0', 'error', 'co-signed-wallets'),
  removedExport: rule('removed-export', '0.12.0', 'error', '4-the-changes-by-topic'),
  baseUrl: rule('base-url-version', '0.11.0', 'error', '3-what-every-app-notices'),
  rawApiPath: rule('raw-api-path', '0.11.0', 'warning', '5-if-you-call-the-api-without-the-sdk'),
  templates: rule('custom-templates', '0.11.1', 'info', 'templates'),
} as const;

const CONTEXT_RENAMES: Record<string, string> = {
  transaction: 'tx',
  openTransactionModal: 'openTxModal',
  config: 'appConfig',
  openRampWidget: 'openRampModal',
  refreshBalance: 'refreshWalletBalance',
};

const ADAPTER_TYPE_RENAMES: Record<string, string> = {
  EscrowFn: 'AdapterFn',
  EscrowAdapter: 'PollarAdapter',
};

const PROFILE_FIELDS = new Set(['mail', 'first_name', 'last_name', 'avatar', 'providers']);

const REMOVED_RAMP_CALLS = new Set([
  'getRampsQuote',
  'getRampCountries',
  'createOnRamp',
  'createOffRamp',
  'completeWithdraw',
  'submitRampSignature',
  'getRampTransaction',
  'retryRampTransaction',
  'pollRampTransaction',
  'continueRamp',
  'continueRampTransaction',
  'signRampAction',
  'getRampLiquidity',
  'getRampKycStatus',
  'decodePixQr',
  'mergeRampSnapshot',
  'mergeRampCountries',
]);

const REMOVED_COSIGN = new Set([
  'cosignGroupOf',
  'cosignStepKeyOf',
  'stepInGroup',
  'CosignGroup',
  'readActivityIntent',
  'readActivityPayload',
  'turnkeyPayload',
]);

const RAMP_REPLACEMENTS: Record<string, string> = {
  getRampsQuote: 'quoteRamp({ direction, fiat, asset, amount: { value, denomination } })',
  getRampCountries: 'rampCountries((await client.getRampRoutes(direction)).routes)',
  createOnRamp: 'createRampOrder({ quoteId, payee })',
  createOffRamp: 'createRampOrder({ quoteId, payee })',
  getRampTransaction: 'getRampOrder(id)',
  pollRampTransaction: 'pollRampOrder(id, { onUpdate, signal })',
  signRampAction: 'signRampLeg(orderId, actionId)',
};

export interface FileScan {
  findings: RawFinding[];
  /** The file builds a PollarClient itself (`new PollarClient(...)`), at this offset. */
  clientConstruction: number | null;
  answersConfirmations: boolean;
  importsRandomValues: boolean;
}

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (/\.[mc]?ts$/.test(file)) return ts.ScriptKind.TS;
  return ts.ScriptKind.JSX;
}

function nameOf(node: ts.Node | undefined): string | null {
  if (!node) return null;
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  return null;
}

function isUsePollarCall(node: ts.Node): node is ts.CallExpression {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'usePollar';
}

// The published SDK packages. Other @pollar/* names (internal workspaces) are not the SDK.
const SDK_PACKAGE =
  /^@pollar\/(core|react|react-native|stellar-wallets-kit-adapter|solana-wallet-standard-adapter|privy-adapter|accesly-adapter)(\/.*)?$/;
const SDK_IMPORT =
  /['"]@pollar\/(core|react|react-native|stellar-wallets-kit-adapter|solana-wallet-standard-adapter|privy-adapter|accesly-adapter)(\/[^'"]*)?['"]/;

function isPollarModule(specifier: string): boolean {
  return SDK_PACKAGE.test(specifier);
}

/**
 * The object is the SDK's client configuration: `new PollarClient({...})`, the
 * `client` / `config` prop of `<PollarProvider>`, or a value typed `PollarClientConfig`.
 */
function isPollarConfig(node: ts.Node): boolean {
  if (!ts.isObjectLiteralExpression(node)) return false;
  const parent = node.parent;
  if (ts.isNewExpression(parent) && ts.isIdentifier(parent.expression) && parent.expression.text === 'PollarClient')
    return true;
  if (ts.isVariableDeclaration(parent) && parent.type && /\bPollarClientConfig\b/.test(parent.type.getText())) return true;
  if (ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent)) {
    const attribute = parent.parent;
    const element = attribute.parent.parent;
    return ['client', 'config'].includes(nameOf(attribute.name) ?? '') && jsxTagName(element) === 'PollarProvider';
  }
  return false;
}

function lineIndent(text: string, pos: number): string {
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
  return /^[ \t]*/.exec(text.slice(lineStart))![0];
}

function stringValue(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

/** Name the JSX element is written with (`PollarProvider`, `Pollar.Provider`). */
function jsxTagName(node: ts.JsxOpeningLikeElement): string {
  const tag = node.tagName;
  if (ts.isIdentifier(tag)) return tag.text;
  if (ts.isPropertyAccessExpression(tag)) return tag.name.text;
  return '';
}

export function scanSource(file: string, text: string): FileScan {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
  const findings: RawFinding[] = [];
  const add = (spec: RuleSpec, node: ts.Node | number, message: string, edits?: TextEdit[]) => {
    const pos = typeof node === 'number' ? node : node.getStart(sf);
    findings.push(edits ? { spec, pos, message, edits } : { spec, pos, message });
  };
  const replace = (node: ts.Node, replacement: string): TextEdit => ({
    start: node.getStart(sf),
    end: node.getEnd(),
    text: replacement,
  });

  const scan: FileScan = {
    findings,
    clientConstruction: null,
    answersConfirmations: text.includes('onConfirmationRequest'),
    importsRandomValues: text.includes('react-native-get-random-values'),
  };

  // Raw calls to the SDK API apply to every file, Pollar import or not.
  const scanRawPaths = (node: ts.Node) => {
    const value = stringValue(node) ?? (ts.isTemplateHead(node) ? node.text : null);
    // A versioned `baseUrl` has a rule of its own, with a fix.
    const isBaseUrl =
      node.parent !== undefined &&
      ts.isPropertyAssignment(node.parent) &&
      nameOf(node.parent.name) === 'baseUrl' &&
      isPollarConfig(node.parent.parent);
    if (value && !isBaseUrl && /sdk\.api(\.[a-z]+)?\.pollar\.xyz\/v[12]\b/.test(value)) {
      add(
        RULES.rawApiPath,
        node,
        'This calls SDK API v1 or v2 directly. The SDK talks to /v3; v1 is retired on 2026-11-30. Move the call to /v3, or use the SDK method that does it.',
      );
    }
  };

  const importsPollar = SDK_IMPORT.test(text);
  if (!importsPollar) {
    const visitRaw = (node: ts.Node) => {
      scanRawPaths(node);
      ts.forEachChild(node, visitRaw);
    };
    visitRaw(sf);
    return scan;
  }

  // Local names a value from usePollar() is stored under: `const pollar = usePollar()`.
  const contextVars = new Set<string>();
  // Local name -> imported name, for what this file imports from @pollar packages.
  const pollarImports = new Map<string, { imported: string; module: string }>();
  // Imported without an alias under a name 0.12 renamed: every use of it is renamed too.
  const renamedImports = new Map<string, { spec: RuleSpec; next: string; message: string; pos: number }>();

  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const module = statement.moduleSpecifier.text;
    if (!isPollarModule(module)) continue;

    if (module === '@pollar/stellar-wallets-kit-adapter/picker') {
      add(
        RULES.kitPicker,
        statement,
        'The /picker bundle no longer exists. Remove this import: the login modal lists every adapter in `walletAdapters` (`stellarWalletsKitAdapters({ network })`).',
      );
      continue;
    }

    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    const exported = TARGET_EXPORTS[module];
    for (const element of bindings.elements) {
      const imported = (element.propertyName ?? element.name).text;
      const local = element.name.text;
      pollarImports.set(local, { imported, module });

      const renamed = ADAPTER_TYPE_RENAMES[imported]
        ? {
            spec: RULES.adapterTypes,
            next: ADAPTER_TYPE_RENAMES[imported]!,
            message: `\`${imported}\` is \`${ADAPTER_TYPE_RENAMES[imported]}\` since 0.7.`,
          }
        : imported === 'stellarWalletsKit' && module === '@pollar/stellar-wallets-kit-adapter'
          ? {
              spec: RULES.kitFactory,
              next: 'stellarWalletsKitAdapters',
              message: '`stellarWalletsKit()` is `stellarWalletsKitAdapters()`, which returns the array for `walletAdapters`.',
            }
          : null;
      if (renamed) {
        if (element.propertyName) add(renamed.spec, element, renamed.message, [replace(element.propertyName, renamed.next)]);
        else renamedImports.set(local, { ...renamed, pos: element.getStart(sf) });
        continue;
      }
      if (REMOVED_RAMP_CALLS.has(imported) || /^(Ramps[A-Z]|RampWorkflow|RampTxStatus$|PaymentInstructions$)/.test(imported)) {
        add(
          RULES.ramps,
          element,
          `\`${imported}\` was removed in 0.12: a ramp is an order of legs on API v3.${RAMP_REPLACEMENTS[imported] ? ` Use \`${RAMP_REPLACEMENTS[imported]}\`.` : ''}`,
        );
        continue;
      }
      if (REMOVED_COSIGN.has(imported)) {
        add(RULES.cosign, element, `\`${imported}\` was removed in 0.12: every co-signed transaction asks for itself.`);
        continue;
      }
      if (exported && !exported.includes(imported)) {
        add(
          RULES.removedExport,
          element,
          `\`${module}\` 0.12 does not export \`${imported}\`. Find it in the upgrade guide, or in the CHANGELOG of the release that removed it.`,
        );
      }
      if (module === '@pollar/react' || module === '@pollar/react-native') {
        if (/Template(Props)?$/.test(imported)) {
          add(
            RULES.templates,
            element,
            `Templates gained props in 0.11 and 0.12. If you mount \`${imported}\` yourself, run the type check: it lists every prop to add.`,
          );
        }
      }
    }
  }

  if (renamedImports.size > 0) {
    const edits = new Map<string, TextEdit[]>();
    const collect = (node: ts.Node) => {
      if (ts.isIdentifier(node) && renamedImports.has(node.text)) {
        const parent = node.parent;
        const isMemberName =
          (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
          (ts.isPropertyAssignment(parent) && parent.name === node) ||
          (ts.isQualifiedName(parent) && parent.right === node);
        if (!isMemberName) {
          const list = edits.get(node.text) ?? [];
          list.push(replace(node, renamedImports.get(node.text)!.next));
          edits.set(node.text, list);
        }
      }
      ts.forEachChild(node, collect);
    };
    collect(sf);
    for (const [local, renamed] of renamedImports) add(renamed.spec, renamed.pos, renamed.message, edits.get(local) ?? []);
  }

  const visit = (node: ts.Node) => {
    scanRawPaths(node);

    if (ts.isVariableDeclaration(node) && node.initializer && isUsePollarCall(node.initializer)) {
      if (ts.isIdentifier(node.name)) contextVars.add(node.name.text);
      else if (ts.isObjectBindingPattern(node.name)) rewriteContextPattern(node, node.name);
    }

    if (ts.isPropertyAccessExpression(node)) checkPropertyAccess(node);

    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'PollarClient') {
      scan.clientConstruction ??= node.getStart(sf);
    }

    if (ts.isCallExpression(node)) checkCall(node);

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) checkJsx(node);

    if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) checkProperty(node);

    const literal = stringValue(node);
    if (literal === 'pollar:session' || literal === 'pollar:walletType') {
      add(
        RULES.storageKey,
        node,
        'The session is no longer stored under this key (0.7), and its token cannot be used without the device key. Use the SDK methods (`getAuthState()`, `getWallet()`, `getUserProfile()`) instead of reading storage.',
      );
    }
    if (literal === 'custodial' && (ts.isBinaryExpression(node.parent) || ts.isCaseClause(node.parent))) {
      add(
        RULES.custodialType,
        node,
        "The embedded wallet type is `'internal'` since 0.9. Read `usePollar().wallet?.custody` (`'internal' | 'smart' | 'external'`).",
      );
    }

    if (ts.isSwitchStatement(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'step') {
      const cases = node.caseBlock.clauses.filter(ts.isCaseClause).map((clause) => stringValue(clause.expression));
      if (cases.includes('building') || cases.includes('signing')) {
        const covered = node.caseBlock.clauses.some((clause) => ts.isDefaultClause(clause));
        if (!covered) {
          add(
            RULES.txSteps,
            node,
            '`TransactionState` has more steps since 0.7.2 (`signed`, `submitting`, `submitted`, `signing-submitting`, `building-signing-submitting`, `awaiting_cosign`). Add the cases or a `default` branch.',
          );
        }
      }
    }

    if (
      ts.isClassDeclaration(node) &&
      node.heritageClauses?.some((h) => h.types.some((t) => t.expression.getText(sf) === 'WalletAdapter'))
    ) {
      add(
        RULES.customAdapter,
        node,
        'A custom wallet adapter: `connect()` resolves `{ address }` only (0.9), the adapter needs `meta: { label }` (0.10), and `signTransaction` is optional on the interface (0.11).',
      );
    }

    ts.forEachChild(node, visit);
  };

  function rewriteContextPattern(declaration: ts.VariableDeclaration, pattern: ts.ObjectBindingPattern) {
    const parts: string[] = [];
    const extraLines: string[] = [];
    const changes: string[] = [];
    let walletBound = false;
    let walletNameTaken = false;

    for (const element of pattern.elements) {
      const key = element.dotDotDotToken ? null : nameOf(element.propertyName ?? element.name);
      const local = ts.isIdentifier(element.name) ? element.name.text : null;
      if (key === 'wallet') walletBound = true;
      else if (local === 'wallet') walletNameTaken = true;

      if (key && CONTEXT_RENAMES[key] && local) {
        const rest = element.initializer ? ` = ${element.initializer.getText(sf)}` : '';
        parts.push(`${CONTEXT_RENAMES[key]}: ${local}${rest}`);
        changes.push(`\`${key}\` is \`${CONTEXT_RENAMES[key]}\` (0.6)`);
        continue;
      }
      if ((key === 'walletAddress' || key === 'walletType') && local) {
        extraLines.push(
          key === 'walletAddress'
            ? `const ${local} = wallet?.address ?? '';`
            : `const ${local} = wallet?.custody === 'external' ? wallet.provider : null;`,
        );
        changes.push(`\`${key}\` comes from \`wallet\` (0.10)`);
        continue;
      }
      parts.push(element.getText(sf));
    }
    if (changes.length === 0) return;

    const spec = extraLines.length > 0 ? RULES.contextWallet : RULES.contextRenames;
    const message = `In \`usePollar()\`: ${changes.join('; ')}.`;
    const statement = declaration.parent?.parent;
    if (
      (extraLines.length > 0 && walletNameTaken) ||
      (extraLines.length > 0 && !(statement && ts.isVariableStatement(statement)))
    ) {
      add(spec, pattern, message);
      return;
    }
    if (extraLines.length > 0 && !walletBound) parts.push('wallet');

    let patternText: string;
    if (pattern.getText(sf).includes('\n')) {
      const first = pattern.elements[0];
      const indent = first ? lineIndent(text, first.getStart(sf)) : '  ';
      const closing = lineIndent(text, pattern.getEnd() - 1);
      patternText = `{\n${parts.map((p) => `${indent}${p},`).join('\n')}\n${closing}}`;
    } else {
      patternText = `{ ${parts.join(', ')} }`;
    }
    const edits: TextEdit[] = [replace(pattern, patternText)];
    if (extraLines.length > 0 && statement) {
      const indent = lineIndent(text, statement.getStart(sf));
      edits.push({
        start: statement.getEnd(),
        end: statement.getEnd(),
        text: extraLines.map((l) => `\n${indent}${l}`).join(''),
      });
    }
    add(spec, pattern, message, edits);
  }

  function checkPropertyAccess(node: ts.PropertyAccessExpression) {
    const name = node.name.text;
    const target = node.expression;
    const onContext = isUsePollarCall(target) || (ts.isIdentifier(target) && contextVars.has(target.text));

    if (onContext && CONTEXT_RENAMES[name]) {
      add(RULES.contextRenames, node.name, `\`usePollar().${name}\` is \`${CONTEXT_RENAMES[name]}\` since 0.6.`, [
        replace(node.name, CONTEXT_RENAMES[name]!),
      ]);
      return;
    }
    if (onContext && (name === 'walletAddress' || name === 'walletType')) {
      const message = `\`usePollar().${name}\` was removed in 0.10: read \`wallet\` (\`wallet?.address\`, \`wallet?.custody\`, \`wallet?.provider\`).`;
      if (ts.isIdentifier(target)) {
        const owner = target.text;
        const replacement =
          name === 'walletAddress'
            ? `(${owner}.wallet?.address ?? '')`
            : `(${owner}.wallet?.custody === 'external' ? ${owner}.wallet.provider : null)`;
        add(RULES.contextWallet, node, message, [replace(node, replacement)]);
      } else {
        add(RULES.contextWallet, node, message);
      }
      return;
    }
    if (name === 'publicKey' && ts.isPropertyAccessExpression(target) && target.name.text === 'wallet') {
      add(RULES.sessionPublicKey, node.name, '`session.wallet.publicKey` is `session.wallet.address` since 0.9.', [
        replace(node.name, 'address'),
      ]);
      return;
    }
    if (PROFILE_FIELDS.has(name) && ts.isPropertyAccessExpression(target) && target.name.text === 'data') {
      add(
        RULES.profileData,
        node,
        `The user's profile left the session in 0.7: read \`client.getUserProfile()?.${name}\` after login.`,
      );
      return;
    }
    if (REMOVED_RAMP_CALLS.has(name)) {
      add(
        RULES.ramps,
        node.name,
        `\`${name}\` was removed in 0.12: a ramp is an order of legs on API v3.${RAMP_REPLACEMENTS[name] ? ` Use \`${RAMP_REPLACEMENTS[name]}\`.` : ''} \`<RampWidget>\` needs no change.`,
      );
      return;
    }
    if (REMOVED_COSIGN.has(name)) {
      add(
        RULES.cosign,
        node.name,
        name === 'turnkeyPayload'
          ? '`client.cosign.verify(request)` returns `proposal` instead of `turnkeyPayload` since 0.12.'
          : `\`${name}\` was removed in 0.12.`,
      );
    }
  }

  function checkCall(node: ts.CallExpression) {
    const callee = node.expression;
    const calleeName = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : null;
    if (!calleeName) return;

    if (calleeName === 'loginWallet') {
      const arg = node.arguments[0];
      const message = '`loginWallet(id)` was removed in 0.10: call `login({ provider: id })`.';
      if (node.arguments.length === 1 && arg) {
        const nameNode = ts.isPropertyAccessExpression(callee) ? callee.name : callee;
        add(RULES.loginWallet, node, message, [replace(nameNode, 'login'), replace(arg, `{ provider: ${arg.getText(sf)} }`)]);
      } else {
        add(RULES.loginWallet, node, message);
      }
      return;
    }
    if (calleeName === 'setTrustline') {
      const options = node.arguments[1];
      if (options && ts.isObjectLiteralExpression(options)) {
        const sponsored = options.properties.find((p) => nameOf(p.name) === 'sponsored');
        if (sponsored) {
          const message =
            "`setTrustline` has no `sponsored` option since 0.11.1: the app's configuration decides who pays. `{ skipSponsorship: true }` makes the user pay.";
          if (options.properties.length === 1) {
            add(RULES.trustlineSponsored, sponsored, message, [
              { start: node.arguments[0]!.getEnd(), end: options.getEnd(), text: '' },
            ]);
          } else {
            add(RULES.trustlineSponsored, sponsored, message);
          }
        }
      }
      return;
    }
    if (calleeName === 'pollKycStatus') {
      add(
        RULES.kycPolling,
        node,
        "`pollKycStatus()` also returns `'pending'` (held for review: stop polling) and `'expired'` since 0.11.4. `pollKycDecision()` gives the review reason.",
      );
      return;
    }
    if ((calleeName === 'parseFloat' || calleeName === 'Number' || calleeName === 'parseInt') && node.arguments[0]) {
      const arg = node.arguments[0];
      if (
        ts.isPropertyAccessExpression(arg) &&
        (arg.name.text === 'balance' || arg.name.text === 'available') &&
        !nullChecked(arg)
      ) {
        add(
          RULES.balanceNullable,
          node,
          `\`${arg.name.text}\` is \`string | null\` since 0.11.1: null means the chain could not be read, not zero. Handle it before converting.`,
        );
      }
      return;
    }
    const imported = pollarImports.get(calleeName)?.imported;
    if (imported === 'stellarWalletsKit' || imported === 'stellarWalletsKitAdapters') {
      const options = node.arguments[0];
      const hasNetwork =
        options && ts.isObjectLiteralExpression(options) && options.properties.some((p) => nameOf(p.name) === 'network');
      if (!hasNetwork && !(options && !ts.isObjectLiteralExpression(options))) {
        add(
          RULES.kitNetwork,
          node,
          '`network` is required since 0.8: `stellarWalletsKitAdapters({ network: Networks.PUBLIC })`.',
        );
      }
    }
  }

  function checkJsx(node: ts.JsxOpeningLikeElement) {
    if (jsxTagName(node) !== 'PollarProvider') return;
    for (const attribute of node.attributes.properties) {
      if (!ts.isJsxAttribute(attribute)) continue;
      const name = nameOf(attribute.name);
      if (name === 'config') {
        add(RULES.providerConfig, attribute, '`<PollarProvider config>` is `client` since 0.8.', [
          replace(attribute.name, 'client'),
        ]);
      } else if (name === 'styles') {
        add(
          RULES.providerStyles,
          attribute,
          "`styles` was removed in 0.8. Remove it to use the dashboard's branding, or move it to `appConfig={{ styles }}`: passing `appConfig` stops the dashboard configuration from loading at all.",
        );
      } else if (name === 'ui' && attribute.initializer && attribute.initializer.getText(sf).includes('renderWallets')) {
        add(
          RULES.renderWallets,
          attribute,
          '`ui.renderWallets` was removed in 0.10. Remove it: the login modal lists every adapter in `walletAdapters`.',
        );
      }
    }
  }

  function checkProperty(node: ts.PropertyAssignment | ts.ShorthandPropertyAssignment) {
    const name = nameOf(node.name);
    if (!isPollarConfig(node.parent)) return;
    if (name === 'walletAdapter') {
      const value = ts.isPropertyAssignment(node) ? node.initializer : null;
      const calleeName =
        value && ts.isCallExpression(value) && ts.isIdentifier(value.expression) ? value.expression.text : null;
      const message = '`walletAdapter` (one resolver) is `walletAdapters` (an array of adapters) since 0.10.';
      if (
        calleeName &&
        ['stellarWalletsKit', 'stellarWalletsKitAdapters'].includes(pollarImports.get(calleeName)?.imported ?? '')
      ) {
        add(RULES.walletAdapterArray, node, message, [replace(node.name, 'walletAdapters')]);
      } else {
        add(RULES.walletAdapterArray, node, `${message} Pass \`[yourAdapter]\`.`);
      }
      return;
    }
    if (name === 'baseUrl' && ts.isPropertyAssignment(node)) {
      const value = stringValue(node.initializer);
      if (value && /\/v\d+\/?$/.test(value)) {
        const origin = value.replace(/\/v\d+\/?$/, '');
        const quote = text[node.initializer.getStart(sf)] ?? "'";
        add(RULES.baseUrl, node.initializer, '`baseUrl` is an origin: the SDK appends the API version itself.', [
          replace(node.initializer, `${quote}${origin}${quote}`),
        ]);
      }
    }
  }

  /** The statement around `expression` already compares it with null. */
  function nullChecked(expression: ts.Expression): boolean {
    let statement: ts.Node = expression;
    while (statement.parent && !ts.isStatement(statement) && !ts.isSourceFile(statement.parent)) statement = statement.parent;
    const subject = expression.getText(sf).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`${subject}\\s*(!==?|===?)\\s*null|${subject}\\s*\\?\\?`).test(statement.getText(sf));
  }

  visit(sf);
  return scan;
}
