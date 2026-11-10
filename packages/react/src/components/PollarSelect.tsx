'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import './PollarSelect.css';

export interface PollarSelectOption {
  value: string;
  label: ReactNode;
  /** What typing a letter matches, and the accessible name; the label's text when it is a string. */
  text?: string;
  /** Shown before the label, in the list and in the closed field. */
  icon?: ReactNode;
  disabled?: boolean;
}

export interface PollarSelectGroup {
  label: string;
  options: PollarSelectOption[];
}

export interface PollarSelectProps {
  value: string;
  options: Array<PollarSelectOption | PollarSelectGroup>;
  onChange: (value: string) => void;
  /** Shown while `value` matches no option. */
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  /** The field's look; the bordered input when not given, a pill in the swap modal. */
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

const isGroup = (item: PollarSelectOption | PollarSelectGroup): item is PollarSelectGroup => 'options' in item;
const textOf = (option: PollarSelectOption) =>
  option.text ?? (typeof option.label === 'string' || typeof option.label === 'number' ? String(option.label) : option.value);

/** Space under the field below which the list opens upwards. */
const MIN_SPACE_BELOW = 220;
const LIST_MAX_HEIGHT = 280;

function Chevron() {
  return (
    <svg className="pollar-select-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The dropdown every Pollar modal uses in place of the browser's `<select>`, so
 * it follows the modal's theme. The list is `position: fixed` inside the modal:
 * the card scrolls (`overflow-y: auto`) and would clip it otherwise, and staying
 * inside the card keeps the theme variables it sets.
 */
export function PollarSelect({
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
  id,
  className = 'pollar-input pollar-select',
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: PollarSelectProps) {
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState<CSSProperties>({});
  const typed = useRef({ text: '', at: 0 });

  const flat = useMemo(() => options.flatMap((item) => (isGroup(item) ? item.options : [item])), [options]);
  const selected = flat.find((option) => option.value === value);
  const enabledIndex = (from: number, step: 1 | -1) => {
    for (let i = from; i >= 0 && i < flat.length; i += step) if (!flat[i]!.disabled) return i;
    return -1;
  };

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    const up = below < MIN_SPACE_BELOW && rect.top > below;
    setPosition({
      left: rect.left,
      minWidth: rect.width,
      maxWidth: Math.max(rect.width, Math.min(320, window.innerWidth - rect.left - 8)),
      maxHeight: Math.min(LIST_MAX_HEIGHT, (up ? rect.top : below) - 12),
      ...(up ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    });
  }, []);

  const openList = () => {
    if (disabled || flat.length === 0) return;
    place();
    const current = flat.findIndex((option) => option.value === value);
    setActive(current >= 0 ? current : enabledIndex(0, 1));
    setOpen(true);
  };
  const close = (focusTrigger = true) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  };
  const choose = (index: number) => {
    const option = flat[index];
    if (!option || option.disabled) return;
    if (option.value !== value) onChange(option.value);
    close();
  };

  useLayoutEffect(() => {
    if (!open) return;
    listRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open || active < 0) return;
    const option = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (typeof option?.scrollIntoView === 'function') option.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  // A click anywhere else closes it; the page or the card scrolling moves it along with the field.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false);
    };
    const onScroll = (event: Event) => {
      if (!listRef.current?.contains(event.target as Node)) place();
    };
    document.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  const typeahead = (key: string) => {
    const now = Date.now();
    typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + key.toLowerCase(), at: now };
    const start = typed.current.text.length === 1 ? active + 1 : active;
    for (let n = 0; n < flat.length; n++) {
      const i = (Math.max(start, 0) + n) % flat.length;
      if (!flat[i]!.disabled && textOf(flat[i]!).toLowerCase().startsWith(typed.current.text)) return i;
    }
    return -1;
  };

  const onTriggerKey = (event: KeyboardEvent) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      openList();
    }
  };

  const onListKey = (event: KeyboardEvent) => {
    let next = -1;
    switch (event.key) {
      case 'ArrowDown':
        next = enabledIndex(active + 1, 1);
        break;
      case 'ArrowUp':
        next = enabledIndex(active - 1, -1);
        break;
      case 'Home':
        next = enabledIndex(0, 1);
        break;
      case 'End':
        next = enabledIndex(flat.length - 1, -1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        choose(active);
        return;
      case 'Escape':
        // Closes the list only, not the modal around it.
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      case 'Tab':
        close(false);
        return;
      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) next = typeahead(event.key);
    }
    if (next >= 0) {
      event.preventDefault();
      setActive(next);
    }
  };

  let index = -1;
  const renderOption = (option: PollarSelectOption) => {
    const i = ++index;
    return (
      <div
        key={option.value}
        id={`${listId}-${i}`}
        data-index={i}
        role="option"
        aria-selected={option.value === value}
        aria-disabled={option.disabled || undefined}
        className={`pollar-select-option${i === active ? ' pollar-select-option-active' : ''}`}
        onPointerMove={() => !option.disabled && setActive(i)}
        onClick={() => choose(i)}
      >
        {option.icon}
        <span className="pollar-select-option-label">{option.label}</span>
        {option.value === value && (
          <svg className="pollar-select-check" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path
              d="M3 7.5 5.75 10 11 4"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
    );
  };

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`${className} pollar-select-trigger`}
        data-value={value}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onTriggerKey}
      >
        {selected?.icon}
        <span className={`pollar-select-value${selected ? '' : ' pollar-select-placeholder'}`}>
          {selected ? selected.label : (placeholder ?? '')}
        </span>
        <Chevron />
      </button>
      {open && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          className="pollar-select-list"
          style={position}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          onKeyDown={onListKey}
        >
          {options.map((item) =>
            isGroup(item)
              ? item.options.length > 0 && (
                  <div key={`group-${item.label}`} role="group" aria-label={item.label}>
                    <div className="pollar-select-group">{item.label}</div>
                    {item.options.map(renderOption)}
                  </div>
                )
              : renderOption(item),
          )}
        </div>
      )}
    </>
  );
}
