import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  type ChartOptions,
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { BarChart3, PieChart, RefreshCw, Sparkles, Users } from 'lucide-react';
import { classApi } from '@/features/classes/api/classApi';
import type { Student } from '@/features/students/types';
import { calculateMajorStats, type MajorStatItem } from '../utils/majorStatsUtil';
import './ClassMajorDistributionCard.css';

// Đăng ký các module Chart.js cần thiết
ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title
);

export interface ClassMajorDistributionCardProps {
  classId: number;
  className?: string;
  assignedStudentIds?: Set<number> | number[];
  initialStudents?: Student[];
}

export function ClassMajorDistributionCard({
  classId,
  className,
  assignedStudentIds,
  initialStudents,
}: ClassMajorDistributionCardProps) {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<'donut' | 'stackedBar'>('donut');
  const [hoveredMajor, setHoveredMajor] = useState<string | null>(null);

  const {
    data: students,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['class-students-stats', classId],
    queryFn: ({ signal }) => classApi.getClassStudents(classId, signal),
    enabled: Boolean(classId),
    initialData: initialStudents,
    staleTime: 30000,
  });

  const stats = useMemo(() => {
    return calculateMajorStats(students || [], assignedStudentIds);
  }, [students, assignedStudentIds]);

  // Dữ liệu cho Donut Chart (Cơ cấu % các chuyên ngành)
  const donutData = useMemo(() => {
    return {
      labels: stats.majors.map((m) => m.majorCode),
      datasets: [
        {
          data: stats.majors.map((m) => m.count),
          backgroundColor: stats.majors.map((m) => m.color),
          borderColor: '#ffffff',
          borderWidth: 2,
          hoverOffset: 6,
        },
      ],
    };
  }, [stats.majors]);

  const donutOptions: ChartOptions<'doughnut'> = useMemo(() => {
    return {
      cutout: '72%',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false, // Dùng legend tương tác tùy biến ở cột bên phải
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.92)',
          titleFont: { size: 13, weight: 'bold' },
          bodyFont: { size: 12 },
          padding: 10,
          cornerRadius: 8,
          boxPadding: 4,
          callbacks: {
            label: (context) => {
              const item = stats.majors[context.dataIndex];
              if (!item) return '';
              const unit = t('classMajor.studentsUnit');
              return ` ${item.majorName} (${item.majorCode}): ${item.count} ${unit} (${item.percentage}%)`;
            },
          },
        },
      },
    };
  }, [stats.majors, t]);

  // Dữ liệu cho Stacked Bar Chart (Phân bổ theo ngành x Tình trạng phân nhóm)
  const barData = useMemo(() => {
    return {
      labels: stats.majors.map((m) => m.majorCode),
      datasets: [
        {
          label: t('classMajor.assigned'),
          data: stats.majors.map((m) => m.assignedCount),
          backgroundColor: '#10B981',
          borderRadius: 4,
        },
        {
          label: t('classMajor.unassigned'),
          data: stats.majors.map((m) => m.unassignedCount),
          backgroundColor: '#F59E0B',
          borderRadius: 4,
        },
      ],
    };
  }, [stats.majors, t]);

  const barOptions: ChartOptions<'bar'> = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: {
            font: { weight: 'bold' },
          },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: {
            precision: 0,
            stepSize: 1,
          },
        },
      },
      plugins: {
        legend: {
          position: 'top' as const,
          labels: {
            boxWidth: 12,
            boxHeight: 12,
            useBorderRadius: true,
            borderRadius: 3,
            font: { size: 12, weight: 'bold' },
          },
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.92)',
          padding: 10,
          cornerRadius: 8,
          boxPadding: 4,
          callbacks: {
            afterTitle: (items) => {
              const index = items[0]?.dataIndex;
              const item = stats.majors[index];
              return item ? item.majorName : '';
            },
          },
        },
      },
    };
  }, [stats.majors, t]);

  if (isPending) {
    return (
      <div className="class-major-distribution-card" data-testid="class-major-distribution-card">
        <div className="major-card-loading">
          <RefreshCw size={24} className="spin" aria-hidden="true" />
          <span>{t('classMajor.loading')}</span>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="class-major-distribution-card" data-testid="class-major-distribution-card">
        <div className="major-card-empty">
          <p>{t('classMajor.error')}</p>
          <button
            type="button"
            className="major-toggle-btn is-active"
            onClick={() => void refetch()}
          >
            <RefreshCw size={14} aria-hidden="true" />
            <span>{t('groupReview.refresh')}</span>
          </button>
        </div>
      </div>
    );
  }

  if (stats.totalStudents === 0) {
    return (
      <div className="class-major-distribution-card" data-testid="class-major-distribution-card">
        <div className="major-card-header">
          <div className="major-card-title-group">
            <div className="major-card-icon" aria-hidden="true">
              <PieChart size={20} />
            </div>
            <div className="major-card-titles">
              <h3>
                {t('classMajor.title')}
                {className && <span className="selected-class-tag">— {className}</span>}
              </h3>
              <p>{t('classMajor.subtitle')}</p>
            </div>
          </div>
        </div>
        <div className="major-card-empty">
          <Users size={32} aria-hidden="true" />
          <p>{t('classMajor.empty')}</p>
        </div>
      </div>
    );
  }

  return (
    <section
      className="class-major-distribution-card"
      aria-label={t('classMajor.title')}
      data-testid="class-major-distribution-card"
    >
      {/* Header with Title and View Mode Toggle */}
      <div className="major-card-header">
        <div className="major-card-title-group">
          <div className="major-card-icon" aria-hidden="true">
            <Sparkles size={20} />
          </div>
          <div className="major-card-titles">
            <h3>
              {t('classMajor.title')}
              {className && <span className="selected-class-tag">— {className}</span>}
            </h3>
            <p>{t('classMajor.subtitle')}</p>
          </div>
        </div>

        <div className="major-card-toggle" role="group" aria-label={t('classMajor.title')}>
          <button
            type="button"
            className={`major-toggle-btn ${viewMode === 'donut' ? 'is-active' : ''}`}
            aria-pressed={viewMode === 'donut'}
            data-testid="toggle-donut-view"
            onClick={() => setViewMode('donut')}
          >
            <PieChart size={15} aria-hidden="true" />
            <span>{t('classMajor.donutView')}</span>
          </button>
          <button
            type="button"
            className={`major-toggle-btn ${viewMode === 'stackedBar' ? 'is-active' : ''}`}
            aria-pressed={viewMode === 'stackedBar'}
            data-testid="toggle-bar-view"
            onClick={() => setViewMode('stackedBar')}
          >
            <BarChart3 size={15} aria-hidden="true" />
            <span>{t('classMajor.barView')}</span>
          </button>
        </div>
      </div>

      {/* Main Content: Chart + Detailed Breakdown Legend */}
      <div className="major-card-content">
        {/* Left Side: Chart Container */}
        <div
          className={`major-chart-wrapper ${viewMode === 'stackedBar' ? 'bar-mode' : ''}`}
          data-testid="major-chart-container"
        >
          {viewMode === 'donut' ? (
            <>
              <Doughnut data={donutData} options={donutOptions} />
              <div className="major-donut-center" aria-hidden="true">
                <span className="donut-center-value">{stats.totalStudents}</span>
                <span className="donut-center-label">{t('classMajor.totalStudents')}</span>
              </div>
            </>
          ) : (
            <Bar data={barData} options={barOptions} />
          )}
        </div>

        {/* Right Side: Interactive Breakdown List */}
        <div className="major-breakdown-list" role="list" aria-label={t('classMajor.majorBreakdown')}>
          {stats.majors.map((major: MajorStatItem) => {
            const isHovered = hoveredMajor === major.majorCode;
            return (
              <div
                key={major.majorCode}
                className={`major-breakdown-item ${isHovered ? 'is-highlighted' : ''}`}
                role="listitem"
                data-testid={`major-item-${major.majorCode}`}
                onMouseEnter={() => setHoveredMajor(major.majorCode)}
                onMouseLeave={() => setHoveredMajor(null)}
              >
                <div className="major-item-top">
                  <div className="major-item-identity">
                    <span
                      className="major-color-indicator"
                      style={{ backgroundColor: major.color }}
                      aria-hidden="true"
                    />
                    <span className="major-code-badge">{major.majorCode}</span>
                    <span className="major-name-text" title={major.majorName}>
                      {major.majorName}
                    </span>
                  </div>

                  <div className="major-item-stats">
                    <span className="major-student-count">
                      {major.count} {t('classMajor.studentsUnit')}
                    </span>
                    <span className="major-percentage-pill">{major.percentage}%</span>
                  </div>
                </div>

                {/* Progress bar showing grouping progress */}
                <div className="major-progress-container">
                  <div
                    className="major-progress-bar"
                    role="progressbar"
                    aria-valuenow={major.assignedCount}
                    aria-valuemin={0}
                    aria-valuemax={major.count}
                  >
                    <div
                      className="major-progress-assigned"
                      style={{ width: `${major.assignedPercentage}%` }}
                      title={`${t('classMajor.assigned')}: ${major.assignedCount}`}
                    />
                    <div
                      className="major-progress-unassigned"
                      style={{ width: `${100 - major.assignedPercentage}%` }}
                      title={`${t('classMajor.unassigned')}: ${major.unassignedCount}`}
                    />
                  </div>
                  <div className="major-progress-labels">
                    <span>
                      <span className="dot-assigned" aria-hidden="true" />
                      {t('classMajor.assigned')}: {major.assignedCount}
                    </span>
                    <span>
                      <span className="dot-unassigned" aria-hidden="true" />
                      {t('classMajor.unassigned')}: {major.unassignedCount}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
