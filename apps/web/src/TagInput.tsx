import { useState } from "react";

export function TagInput({
  values,
  onChange,
}: {
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const unique = values;

  function add() {
    const next = draft.trim();
    if (!next || unique.includes(next)) {
      setDraft("");
      return;
    }
    onChange([...unique, next]);
    setDraft("");
  }

  return (
    <div>
      <div className="tag-row">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder="Type and press Enter"
        />
        <button className="btn ghost" type="button" onClick={add}>
          Add
        </button>
      </div>
      <div className="tags">
        {unique.map((value) => (
          <span className="tag" key={value}>
            {value}
            <button type="button" onClick={() => onChange(unique.filter((item) => item !== value))}>
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
