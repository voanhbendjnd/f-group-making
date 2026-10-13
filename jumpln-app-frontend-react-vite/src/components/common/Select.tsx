import React, { forwardRef } from 'react';
import { AlertCircle } from 'lucide-react';

export interface SelectOption {
  value: string | number;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  options: SelectOption[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, hint, error, required, options, className = '', id, ...props }, ref) => {
    const selectId = id || `select-${Math.random().toString(36).substring(2, 9)}`;

    return (
      <div className="form-group">
        {label && (
          <label htmlFor={selectId} className="form-label">
            <span>
              {label}
              {required && <span className="required">*</span>}
            </span>
          </label>
        )}

        <select
          ref={ref}
          id={selectId}
          className={`form-control ${error ? 'is-invalid' : ''} ${className}`}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {hint && !error && <div className="form-hint">{hint}</div>}

        {error && (
          <div className="form-error">
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
