import { useRef, useState, type PointerEvent } from 'react';

interface RankingProps {
  options: { id: string; label: string }[];
  value: string[];
  onChange: (value: string[]) => void;
}

interface DragState { id: string; pointerId: number; x: number; y: number; moved: boolean }
interface DragPreview { label: string; x: number; y: number; target: number | null }

function targetRank(x: number, y: number): number | null {
  const target = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-rank-slot]');
  return target ? Number(target.dataset.rankSlot) : null;
}

export function RankingInput({ options, value, onChange }: RankingProps) {
  const drag = useRef<DragState | null>(null);
  const handledButton = useRef<HTMLButtonElement | null>(null);
  const [preview, setPreview] = useState<DragPreview | null>(null);

  function assign(id: string, target: number) {
    const current = value.indexOf(id);
    if (current === target) return;
    const next = [...value];
    if (current >= 0) next[current] = next[target];
    next[target] = id;
    onChange(next);
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (!event.isPrimary || event.button !== 0) return;
    handledButton.current = null;
    drag.current = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 8) return;
    current.moved = true;
    setPreview({
      label: options.find(option => option.id === current.id)!.label,
      x: event.clientX, y: event.clientY, target: targetRank(event.clientX, event.clientY),
    });
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>, tap: () => void) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    if (!current.moved) {
      if (event.pointerType === 'touch' && event.currentTarget.contains(document.elementFromPoint(event.clientX, event.clientY))) {
        handledButton.current = event.currentTarget;
        tap();
      }
      return;
    }
    handledButton.current = event.currentTarget;
    setPreview(null);
    const target = targetRank(event.clientX, event.clientY);
    if (target !== null) assign(current.id, target);
  }

  function cancelDrag(event: PointerEvent<HTMLButtonElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setPreview(null);
  }

  const bindings = (id: string, tap: () => void) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => startDrag(event, id),
    onPointerMove: moveDrag,
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => endDrag(event, tap),
    onPointerCancel: cancelDrag, onLostPointerCapture: cancelDrag,
  });
  const choose = (id: string) => {
    const empty = value.indexOf('');
    if (empty >= 0 && !value.includes(id)) assign(id, empty);
  };

  return <div className="ranking">
    <p className="muted">拖动选项到名次框，或点选填入空位；点已选名次可清除。</p>
    <div className="rank-slots">
      {value.map((id, index) => {
        const label = options.find(option => option.id === id)?.label;
        const clear = () => { if (label) onChange(value.map((choice, slot) => slot === index ? '' : choice)); };
        return <button key={index} type="button" data-rank-slot={index} className="rank-slot" data-selected={Boolean(label)} data-drop={preview?.target === index}
          aria-label={label ? `第 ${index + 1} 名：${label}，点击移除` : `第 ${index + 1} 名：未选择`}
          {...(label ? bindings(id, clear) : {})}
          onClick={event => {
            if (event.detail && handledButton.current === event.currentTarget) { handledButton.current = null; return; }
            clear();
          }}>
          <span>{index + 1}</span><strong>{label ?? '待选择'}</strong>
        </button>;
      })}
    </div>
    <div className="rank-options">
      {options.map(option => <button key={option.id} type="button" data-in-rank={value.includes(option.id)} {...bindings(option.id, () => choose(option.id))}
        aria-pressed={value.includes(option.id)} onClick={event => {
          if (event.detail && handledButton.current === event.currentTarget) { handledButton.current = null; return; }
          choose(option.id);
        }}><b aria-hidden="true">⠿</b>{option.label}</button>)}
    </div>
    <p className="visually-hidden" role="status">已选 {value.filter(Boolean).length} 项，共 3 项。</p>
    {preview && <span className="rank-ghost" aria-hidden="true" style={{ left: preview.x + 12, top: preview.y + 12 }}>{preview.label}</span>}
  </div>;
}
