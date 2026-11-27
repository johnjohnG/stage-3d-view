import React, { useEffect, useState } from 'react';
import {
  clampStageNumber,
  feetAndInchesToDecimal,
  feetToFeetAndInches,
} from '../utils/imperial';

interface ImperialInputProps {
  label: string;
  valueFeet: number;
  minFeet: number;
  maxFeet: number;
  onChange: (nextFeet: number) => void;
}

export const ImperialInput: React.FC<ImperialInputProps> = ({
  label,
  valueFeet,
  minFeet,
  maxFeet,
  onChange,
}) => {
  const parsed = feetToFeetAndInches(valueFeet);
  const [ftStr, setFtStr] = useState(String(parsed.feet));
  const [inStr, setInStr] = useState(String(parsed.inches));

  useEffect(() => {
    const next = feetToFeetAndInches(valueFeet);
    setFtStr(String(next.feet));
    setInStr(String(next.inches));
  }, [valueFeet]);

  const commitValues = (rawFt: string, rawIn: string) => {
    const f = Number.parseFloat(rawFt);
    const i = Number.parseFloat(rawIn);
    const safeF = Number.isFinite(f) ? f : 0;
    const safeI = Number.isFinite(i) ? i : 0;
    const combined = clampStageNumber(feetAndInchesToDecimal(safeF, safeI), minFeet, maxFeet);
    onChange(combined);

    const normalized = feetToFeetAndInches(combined);
    setFtStr(String(normalized.feet));
    setInStr(String(normalized.inches));
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-slate-400 whitespace-nowrap">{label}</span>
      <div className="flex items-center gap-1.5">
        <div className="flex items-center flex-1 min-w-0 rounded-md border border-slate-700/80 bg-[#0c1016] px-2 py-1 focus-within:border-sky-400">
          <input
            type="number"
            step="1"
            value={ftStr}
            onChange={(e) => {
              setFtStr(e.target.value);
              const val = Number.parseFloat(e.target.value);
              const curIn = Number.parseFloat(inStr);
              if (Number.isFinite(val)) {
                const combined = clampStageNumber(
                  feetAndInchesToDecimal(val, Number.isFinite(curIn) ? curIn : 0),
                  minFeet,
                  maxFeet,
                );
                onChange(combined);
              }
            }}
            onBlur={() => commitValues(ftStr, inStr)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitValues(ftStr, inStr);
            }}
            aria-label={`${label} feet`}
            className="w-full min-w-0 bg-transparent text-xs font-mono-tabular text-slate-100 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="ml-1 text-[11px] font-mono-tabular text-slate-500">ft</span>
        </div>

        <div className="flex items-center flex-1 min-w-0 rounded-md border border-slate-700/80 bg-[#0c1016] px-2 py-1 focus-within:border-sky-400">
          <input
            type="number"
            step="0.5"
            value={inStr}
            onChange={(e) => {
              setInStr(e.target.value);
              const val = Number.parseFloat(e.target.value);
              const curFt = Number.parseFloat(ftStr);
              if (Number.isFinite(val)) {
                const combined = clampStageNumber(
                  feetAndInchesToDecimal(Number.isFinite(curFt) ? curFt : 0, val),
                  minFeet,
                  maxFeet,
                );
                onChange(combined);
              }
            }}
            onBlur={() => commitValues(ftStr, inStr)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitValues(ftStr, inStr);
            }}
            aria-label={`${label} inches`}
            className="w-full min-w-0 bg-transparent text-xs font-mono-tabular text-slate-100 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="ml-1 text-[11px] font-mono-tabular text-slate-500">in</span>
        </div>
      </div>
    </div>
  );
};
