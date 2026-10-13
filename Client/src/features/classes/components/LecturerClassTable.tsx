import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { SchoolClass } from '../types';

export function LecturerClassTable({ classes }: { classes: SchoolClass[] }) {
  const { t } = useTranslation();
  return <div className="table-container" tabIndex={0} role="region" aria-label={t('lecturer.myClasses')}>
    <table className="table lecturer-class-table">
      <thead><tr>
        <th scope="col">{t('lecturer.className')}</th><th scope="col">{t('lecturer.term')}</th>
        <th scope="col">{t('lecturer.studentCount')}</th><th scope="col">{t('lecturer.actions')}</th>
      </tr></thead>
      <tbody>{classes.map(schoolClass => <tr key={schoolClass.id}>
        <th scope="row"><Link to={`/lecturer/classes/${schoolClass.id}`}>{schoolClass.name}</Link></th>
        <td>{schoolClass.termName || t('lecturer.noTerm')}</td>
        <td>{t('lecturer.students', { count: schoolClass.studentCount })}</td>
        <td><Link className="btn btn-sm btn-secondary" to={`/lecturer/classes/${schoolClass.id}`} aria-label={t('lecturer.openClassLabel', { name: schoolClass.name })}>
          {t('lecturer.openClass')}
        </Link></td>
      </tr>)}</tbody>
    </table>
  </div>;
}
