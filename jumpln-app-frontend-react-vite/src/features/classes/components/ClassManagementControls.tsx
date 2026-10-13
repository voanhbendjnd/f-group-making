import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Settings2, Users } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { ClassRulesPanel } from '@/features/rules/components/ClassRulesPanel';
import { ClassLecturerAssignment } from './ClassLecturerAssignment';
import type { SchoolClass } from '../types';

export function ClassManagementControls({ schoolClass }: { schoolClass: SchoolClass }) {
  const { t } = useTranslation();
  const id = useId();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rulesVisited, setRulesVisited] = useState(false);
  const [lecturerOpen, setLecturerOpen] = useState(false);
  const [lecturerVisited, setLecturerVisited] = useState(false);
  return <div className="class-management-controls">
    <div className="class-management-actions" role="group" aria-label={t('classes.managementActions')}>
      <Button type="button" variant="secondary" icon={<Settings2 size={18} />}
        aria-expanded={rulesOpen} aria-controls={`${id}-rules`} onClick={() => {
          setRulesVisited(true); setRulesOpen(previous => !previous);
        }}>
        <span>{t('rules.configureButton')}</span>
        {rulesOpen ? <ChevronUp className="class-management-indicator" size={18} aria-hidden="true" />
          : <ChevronDown className="class-management-indicator" size={18} aria-hidden="true" />}
      </Button>
      <Button type="button" variant="secondary" icon={<Users size={18} />}
        aria-expanded={lecturerOpen} aria-controls={`${id}-lecturer`} onClick={() => {
          setLecturerVisited(true); setLecturerOpen(previous => !previous);
        }}>
        <span>{t(schoolClass.lecturerId === null ? 'classAssignment.choose' : 'classAssignment.change')}</span>
        {lecturerOpen ? <ChevronUp className="class-management-indicator" size={18} aria-hidden="true" />
          : <ChevronDown className="class-management-indicator" size={18} aria-hidden="true" />}
      </Button>
    </div>
    <div id={`${id}-lecturer`} hidden={!lecturerOpen} className="class-management-panel">
      {lecturerVisited && <ClassLecturerAssignment schoolClass={schoolClass} />}
    </div>
    <div id={`${id}-rules`} hidden={!rulesOpen} className="class-management-panel">
      {rulesVisited && <ClassRulesPanel classId={schoolClass.id} />}
    </div>
  </div>;
}
