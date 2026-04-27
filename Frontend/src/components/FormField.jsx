import React from 'react';
export default function FormField({
  label,
  name,
  value,
  onChange,
  type = 'text',
  error,
  placeholder,
  children,
}) {
  return (
    <div className="form-field">
      {label ? <label htmlFor={name}>{label}</label> : null}
      {children ? (
        children
      ) : (
        <input
          id={name}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={error ? 'input error' : 'input'}
        />
      )}
      {error ? <span className="field-error">{error}</span> : null}
    </div>
  );
}

