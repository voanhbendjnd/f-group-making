import { useId } from 'react';
import { Download, FileSpreadsheet, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './importTemplates.css';

const studentColumns = [
  ['B', 'RollNumber', 'rollNumber', 'TEST0001'],
  ['C', 'FullName', 'fullName', 'Sinh viên minh họa'],
  ['D', 'Khoá', 'major', 'BEN_SE_ET_26'],
  ['E', 'MemberCode', 'memberCode', 'MEM_TEST0001'],
  ['F', 'Email', 'email', 'student.demo@example.test'],
  ['I', 'GroupName', 'className', 'EXE101_DEMO'],
  ['J', 'GV', 'lecturerCode', 'GV_MAU'],
] as const;
const lecturerColumns = [
  ['A', 'Mentor', 'lecturerCode', 'GV_MAU'],
  ['B', 'Email', 'email', 'lecturer.demo@example.test'],
] as const;

export function ImportTemplateGuide({ kind }: { kind: 'students' | 'lecturers' }) {
  const { t } = useTranslation();
  const titleId = useId();
  const students = kind === 'students';
  return <section className="import-template-guide" aria-labelledby={titleId}>
    <div className="import-template-heading">
      <span className="import-template-icon"><FileSpreadsheet size={22} aria-hidden="true" /></span>
      <div className="import-template-copy">
        <h3 id={titleId}>{t(students ? 'importTemplates.studentsTitle' : 'importTemplates.lecturersTitle')}</h3>
        <p>{t('importTemplates.description')}</p>
      </div>
      <a href={`${import.meta.env.BASE_URL}sample-${kind}.xlsx`}
        download={students ? 'mau_danh_sach_sinh_vien.xlsx' : 'mau_danh_sach_giang_vien.xlsx'}
        className="btn btn-outline import-template-download">
        <Download size={17} aria-hidden="true" />
        {t(students ? 'adminUx.studentTemplate' : 'adminUx.lecturerTemplate')}
      </a>
    </div>
    <p className="import-template-start">{t(students ? 'importTemplates.studentsStart' : 'importTemplates.lecturersStart')}</p>
    <details className="import-template-details">
      <summary>{t('importTemplates.viewStructure')}<ChevronDown size={16} aria-hidden="true" /></summary>
      <div className="import-template-table-scroll" role="region" aria-label={t('importTemplates.columnsLabel')} tabIndex={0}>
        <table className="import-template-table">
          <thead><tr>{['column', 'header', 'meaning', 'example'].map(key => <th key={key} scope="col">{t(`importTemplates.${key}`)}</th>)}</tr></thead>
          <tbody>{(students ? studentColumns : lecturerColumns).map(([column, header, meaning, example]) => <tr key={column}>
            <td><span className="import-template-column">{column}</span></td><td><code>{header}</code></td>
            <td>{t(`importTemplates.fields.${meaning}`)}</td><td>{example}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <ul className="import-template-notes">
        <li>{t('importTemplates.keepFormat')}</li>
        {students && <li>{t('importTemplates.studentRules')}</li>}
        <li>{t(students ? 'importTemplates.studentUniqueValues' : 'importTemplates.lecturerUniqueValues')}</li>
      </ul>
    </details>
  </section>;
}
