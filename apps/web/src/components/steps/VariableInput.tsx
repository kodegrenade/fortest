import React, { useState, useRef, useEffect } from 'react';
import type { BucketVariable, Step } from '@fortest/types';

interface VariableInputProps {
  value: string;
  onChange: (val: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  style?: React.CSSProperties;
  className?: string;
  disabled?: boolean;
  type?: 'text' | 'textarea';
  list?: string; // HTML datalist support
  variables: BucketVariable[];
  precedingSteps: Step[];
}

interface SuggestionOption {
  key: string;
  label: string;
  source: 'env' | 'step';
  sourceName: string;
  detail: string;
}

export function VariableInput({
  value,
  onChange,
  onBlur,
  placeholder,
  style,
  className = '',
  disabled = false,
  type = 'text',
  list,
  variables,
  precedingSteps,
}: VariableInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [triggerIdx, setTriggerIdx] = useState(-1);
  const [activeIndex, setActiveIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // Compile all available suggestions
  const suggestions: SuggestionOption[] = [];

  // 1. Bucket + environment variables; for a key set in both, the later (environment) value wins.
  const effective = new Map(variables.filter((v) => v.enabled && v.key).map((v) => [v.key, v]));
  for (const v of effective.values()) {
    suggestions.push({
      key: v.key,
      label: v.key,
      source: 'env',
      sourceName: 'Global',
      detail: v.secret ? 'Secret value' : v.value ? `Value: ${v.value}` : 'Empty',
    });
  }

  // 2. Preceding steps' extractions
  for (const step of precedingSteps) {
    for (const ex of step.extractions || []) {
      if (!ex.variableName) continue;
      suggestions.push({
        key: `steps.${step.name}.${ex.variableName}`,
        label: `${step.name}.${ex.variableName}`,
        source: 'step',
        sourceName: step.name,
        detail: `Extracts: ${ex.selector} (${ex.source})`,
      });
    }
  }

  // Filter suggestions
  const filteredOptions = suggestions.filter((opt) =>
    opt.key.toLowerCase().includes(filterText.toLowerCase()) ||
    opt.sourceName.toLowerCase().includes(filterText.toLowerCase())
  );

  const handleTextAnalysis = (target: HTMLInputElement | HTMLTextAreaElement) => {
    const cursor = target.selectionStart ?? 0;
    const textBeforeCursor = target.value.slice(0, cursor);
    const lastTrigger = textBeforeCursor.lastIndexOf('{{');

    if (lastTrigger !== -1) {
      // Check if there is a closing "}}" between the trigger and the cursor
      const closingIdx = textBeforeCursor.indexOf('}}', lastTrigger);
      if (closingIdx === -1 || closingIdx >= cursor) {
        // We are currently editing a variable!
        const query = textBeforeCursor.slice(lastTrigger + 2);
        setIsOpen(true);
        setFilterText(query);
        setTriggerIdx(lastTrigger);
        setActiveIndex(0);
        return;
      }
    }
    setIsOpen(false);
  };

  const handleSelectOption = (opt: SuggestionOption) => {
    if (triggerIdx === -1 || !inputRef.current) return;

    const cursor = inputRef.current.selectionStart ?? 0;
    const beforeTrigger = value.slice(0, triggerIdx);
    const afterCursor = value.slice(cursor);
    const inserted = `{{${opt.key}}}`;
    const newValue = beforeTrigger + inserted + afterCursor;

    onChange(newValue);
    setIsOpen(false);

    // Reposition cursor after the variable token
    const nextCursorPos = triggerIdx + inserted.length;
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(nextCursorPos, nextCursorPos);
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % Math.max(1, filteredOptions.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + filteredOptions.length) % Math.max(1, filteredOptions.length));
    } else if (e.key === 'Enter') {
      if (filteredOptions[activeIndex]) {
        e.preventDefault();
        handleSelectOption(filteredOptions[activeIndex]!);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  // Close popup when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="variable-input-container"
      style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column' }}
    >
      {type === 'textarea' ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          className={`input ${className}`}
          placeholder={placeholder}
          style={style}
          disabled={disabled}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            handleTextAnalysis(e.target);
          }}
          onKeyDown={handleKeyDown}
          onBlur={onBlur}
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          className={`input ${className}`}
          type="text"
          list={list}
          placeholder={placeholder}
          style={style}
          disabled={disabled}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            handleTextAnalysis(e.target);
          }}
          onKeyDown={handleKeyDown}
          onBlur={onBlur}
        />
      )}

      {isOpen && filteredOptions.length > 0 && (
        <div className="variables-dropdown">
          <div className="variables-dropdown__title">Available Variables</div>
          <div className="variables-dropdown__list">
            {filteredOptions.map((opt, idx) => (
              <div
                key={opt.key}
                className={`variables-dropdown__item ${idx === activeIndex ? 'variables-dropdown__item--active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelectOption(opt);
                }}
                onMouseEnter={() => setActiveIndex(idx)}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <div className="variables-dropdown__label">{opt.label}</div>
                  <span className={`badge badge--${opt.source}`}>
                    {opt.sourceName}
                  </span>
                </div>
                <div className="variables-dropdown__detail">{opt.detail}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
