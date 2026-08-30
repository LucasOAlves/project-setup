export function ProviderSelect<T extends string>({
  value,
  onChange,
  options,
  labels,
  label,
}: {
  value: T | "";
  onChange: (value: T | "") => void;
  options: readonly T[];
  labels: Record<T, string>;
  label: string;
}) {
  return (
    <label className="field" style={{ maxWidth: 240 }}>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value as T | "")}>
        <option value="">Server default</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option]}
          </option>
        ))}
      </select>
    </label>
  );
}
