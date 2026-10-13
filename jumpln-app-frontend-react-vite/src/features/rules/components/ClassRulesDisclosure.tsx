import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Settings2 } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { ClassRulesPanel } from './ClassRulesPanel';

export function ClassRulesDisclosure({ classId, readOnly = false }: { classId: number; readOnly?: boolean }) {
  const { t } = useTranslation();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  return <div className="class-rules-disclosure">
    <Button type="button" variant="secondary" icon={<Settings2 size={18} />}
      aria-expanded={open} aria-controls={panelId} onClick={() => { setOpened(true); setOpen(previous => !previous); }}>
      {t(readOnly ? 'rules.viewButton' : 'rules.configureButton')}
      {open ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
    </Button>
    <div id={panelId} hidden={!open} className="class-rules-disclosure-panel">
      {opened && <ClassRulesPanel classId={classId} readOnly={readOnly} />}
    </div>
  </div>;
}
