import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle2, Info, RefreshCw, Save } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { getApiError } from '@/services/api/types';
import { RULE_CODES, getRuleMinimum, type ClassRules, type RuleCode, type RuleFormValues, type RuleStatuses, type SaveClassRules } from '../types';
import { validateRuleValues } from '../utils/ruleValidation';
import { useUnsavedChanges } from '@/app/providers/NavigationGuard';

interface Props {
  readOnly?: boolean;
  initial: ClassRules;
  onSave: (request: SaveClassRules) => Promise<ClassRules>;
  onReload: () => Promise<ClassRules>;
}

function formValues(data: ClassRules): RuleFormValues {
  return {
    ...Object.fromEntries(data.rules.map(rule => [rule.code, rule.value])),
    statuses: Object.fromEntries(data.rules.map(rule => [rule.code, rule.status])) as RuleStatuses,
  } as RuleFormValues;
}

const sections = [
  { name: 'members', min: 'MIN_MEMBERS_PER_GROUP', max: 'MAX_MEMBERS_PER_GROUP' },
  { name: 'groups', min: 'MIN_GROUPS_PER_CLASS', max: 'MAX_GROUPS_PER_CLASS' },
  { name: 'majors', min: 'MIN_MAJORS_PER_GROUP', max: 'MAX_MAJORS_PER_GROUP' },
] as const;

export function ClassRulesForm({ initial, onSave, onReload, readOnly = false }: Props) {
  const { t } = useTranslation();
  const baseline = useRef(initial);
  const busy = useRef(false);
  const invalidField = useRef<RuleCode | null>(null);
  const [configured, setConfigured] = useState(initial.configured);
  const [warnings, setWarnings] = useState(initial.warnings);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error' | 'warning'; key?: string; text?: string } | null>(null);
  const [mustReload, setMustReload] = useState(false);
  const [reloading, setReloading] = useState(false);
  const { register, handleSubmit, setError, setFocus, clearErrors, reset, control, setValue,
    formState: { errors, isSubmitting, isDirty } } = useForm<RuleFormValues>({ defaultValues: formValues(initial) });
  const statuses = useWatch({ control, name: 'statuses' });
  useUnsavedChanges(!readOnly && isDirty, isSubmitting || reloading);

  useEffect(() => {
    // Focus after the submitting fieldset is enabled again.
    if (!isSubmitting && invalidField.current) {
      setFocus(invalidField.current);
      invalidField.current = null;
    }
  }, [isSubmitting, setFocus]);

  const accept = (data: ClassRules) => {
    baseline.current = data;
    setConfigured(data.configured);
    setWarnings(data.warnings);
    reset(formValues(data));
    setMustReload(false);
  };

  const save = async (values: RuleFormValues) => {
    if (readOnly || busy.current || mustReload) return;
    clearErrors();
    const validation = validateRuleValues(values);
    const entries = Object.entries(validation) as [RuleCode, string][];
    if (entries.length) {
      invalidField.current = entries[0]![0];
      entries.forEach(([code, key]) => setError(code, { message: key }));
      return;
    }
    busy.current = true;
    setNotice(null);
    try {
      const data = await onSave({ version: baseline.current.version,
        rules: RULE_CODES.map(code => ({ code, value: values[code], status: values.statuses[code] })) });
      accept(data);
      setNotice({ kind: 'success', key: 'rules.saved' });
    } catch (value: unknown) {
      const error = getApiError(value);
      const unknown = error.outcomeUnknown || error.status === 0 || error.status >= 500;
      const conflict = error.status === 409;
      setMustReload(Boolean(unknown || conflict || error.status === 403));
      setNotice({ kind: unknown || conflict ? 'warning' : 'error',
        key: unknown ? 'rules.unknownSave' : conflict ? 'rules.conflict' : error.message ? undefined : 'rules.saveFailed',
        text: error.message });
    } finally {
      busy.current = false;
    }
  };

  const reload = async () => {
    if (busy.current) return;
    busy.current = true;
    setReloading(true);
    try {
      accept(await onReload());
      setNotice({ kind: 'success', key: 'rules.reloaded' });
    } catch (value: unknown) {
      const message = getApiError(value).message;
      setNotice({ kind: 'error', key: message ? undefined : 'rules.loadFailed', text: message });
    } finally {
      busy.current = false;
      setReloading(false);
    }
  };

  const ruleToggle = (codes: readonly RuleCode[], label: string) => {
    const enabled = codes.some(code => statuses[code]);
    const mixed = enabled && !codes.every(code => statuses[code]);
    return <div className="rule-status">
      <label className="rule-status-control">
        <input type="checkbox" role="switch" disabled={readOnly} checked={enabled}
          aria-label={t('rules.toggleLabel', { rule: label })}
          onChange={event => {
            if (readOnly || busy.current) return;
            const checked = event.target.checked;
            codes.forEach(code => setValue(`statuses.${code}`, checked, { shouldDirty: true }));
            clearErrors();
          }} />
        <span>{t(mixed ? 'rules.partlyEnabled' : enabled ? 'rules.enabled' : 'rules.disabled')}</span>
      </label>
      {mixed && <p className="form-hint">{t('rules.mixedStatusHint', {
        minimum: t(statuses[codes[0]!] ? 'rules.enabled' : 'rules.disabled'),
        maximum: t(statuses[codes[1]!] ? 'rules.enabled' : 'rules.disabled'),
      })}</p>}
      {!enabled && <p className="form-hint">{t('rules.disabledHint')}</p>}
    </div>;
  };

  const ruleField = (code: RuleCode, label: string) => {
    const minimum = getRuleMinimum(code);
    const validationKey = minimum === 0 ? 'rules.seIntegerRequired' : 'rules.integerRequired';
    return <div key={code} className={`rule-field ${statuses[code] ? '' : 'rule-field-inactive'}`}>
      <Input id={`rule-${code}`} type="number" min={minimum} max={1000} step={1} required
        readOnly={readOnly || !statuses[code]} label={label}
        error={errors[code]?.message ? t(errors[code].message) : undefined}
        {...register(code, {
          valueAsNumber: true,
          required: validationKey,
          validate: value => Number.isInteger(value) && value >= minimum && value <= 1000 || validationKey,
        })} />
    </div>;
  };

  return <section className="card lecturer-card" aria-labelledby="class-rules-heading">
    <div className="lecturer-section-header">
      <div><h2 id="class-rules-heading">{t('rules.title')}</h2><p>{t('rules.description')}</p></div>
      <span className={`badge ${configured ? 'badge-success' : 'badge-warning'}`}>{t(configured ? 'rules.configured' : 'rules.notConfigured')}</span>
    </div>
    {readOnly && <div className="alert alert-info"><Info size={20} aria-hidden="true" /><p>{t('rules.readOnly')}</p></div>}
    {!configured && <div className="alert alert-info"><Info size={20} aria-hidden="true" /><p>{t(readOnly ? 'rules.readOnlySuggestions' : 'rules.suggestions')}</p></div>}
    <p className="rules-help">{t('rules.statusHint')}</p>
    <form onSubmit={event => { void handleSubmit(save, fieldErrors => {
      invalidField.current = Object.keys(fieldErrors)[0] as RuleCode;
    })(event); }} noValidate>
      <fieldset disabled={isSubmitting || reloading} className="rules-fieldset">
        <div className="rules-grid">
          {sections.map(section => <fieldset key={section.name} className="rules-section">
            <legend>{t(`rules.sections.${section.name}.title`)}</legend>
            <p>{t(`rules.sections.${section.name}.hint`)}</p>
            {ruleToggle([section.min, section.max], t(`rules.sections.${section.name}.title`))}
            <div className="rules-pair">
              {[section.min, section.max].map((code, index) => ruleField(code,
                t(index === 0 ? 'rules.minimum' : 'rules.maximum')))}
            </div>
          </fieldset>)}
          <fieldset className="rules-section">
            <legend>{t('rules.sections.seMembers.title')}</legend>
            <p>{t('rules.sections.seMembers.hint')}</p>
            {ruleToggle(['MIN_SE_MEMBERS_PER_GROUP'], t('rules.sections.seMembers.title'))}
            {ruleField('MIN_SE_MEMBERS_PER_GROUP', t('rules.seMinimumLabel'))}
          </fieldset>
        </div>
      </fieldset>
      <p className="rules-help">{t('rules.validationTiming')}</p>
      {warnings.length > 0 && <div className="alert alert-warning" role="status">
        <AlertCircle size={20} aria-hidden="true" />
        <div><strong>{t('rules.warningsTitle')}</strong><ul className="rules-warning-list">
          {warnings.map(code => <li key={code}>{t(`rules.warnings.${code}`, { defaultValue: t('rules.warningsFallback') })}</li>)}
        </ul><p>{t('rules.warningsHint')}</p></div>
      </div>}
      {notice && <div className={`alert alert-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
        {notice.kind === 'success' ? <CheckCircle2 size={20} aria-hidden="true" /> : <AlertCircle size={20} aria-hidden="true" />}
        <p>{notice.key ? t(notice.key) : notice.text}</p>
      </div>}
      {!readOnly && <div className="rules-actions">
        <Button type="submit" loading={isSubmitting} disabled={reloading || mustReload || (configured && !isDirty)} icon={<Save size={18} />}>
          {t('rules.save')}
        </Button>
        {mustReload ? <Button type="button" variant="secondary" loading={reloading} icon={<RefreshCw size={18} />} onClick={() => { void reload(); }}>
          {t('rules.reload')}
        </Button> : isDirty && <Button type="button" variant="secondary" disabled={isSubmitting || reloading} onClick={() => { reset(formValues(baseline.current)); setNotice(null); }}>
          {t('rules.discard')}
        </Button>}
        <span className="rules-help" aria-live="polite">{mustReload ? t('rules.reloadRequired') : isDirty ? t('rules.unsaved') : t('rules.noChanges')}</span>
      </div>}
    </form>
  </section>;
}
