import { useEffect, useState } from "react";
import {
  SALARY_PERIODS,
  SPOKEN_LANGUAGE_LEVELS,
  type ApplicationDetailsInput,
  type SpokenLanguageLevel,
} from "@studio/shared";
import { fetchApplicationDetails, saveApplicationDetails, type ApiError } from "./api";

type Education = ApplicationDetailsInput["education"][number];
type Certification = ApplicationDetailsInput["certifications"][number];
type SpokenLanguage = ApplicationDetailsInput["spokenLanguages"][number];

const EMPTY: ApplicationDetailsInput = {
  contact: { email: "", phone: "", city: "", country: "", linkedinUrl: "", githubUrl: "", portfolioUrl: "" },
  education: [],
  certifications: [],
  spokenLanguages: [],
  workAuthorization: "",
  requiresVisaSponsorship: null,
  noticePeriod: "",
  timeZone: "",
  salaryExpectation: null,
};

const LEVEL_LABELS: Record<SpokenLanguageLevel, string> = {
  NATIVE: "Native",
  FLUENT: "Fluent",
  ADVANCED: "Advanced",
  INTERMEDIATE: "Intermediate",
  BASIC: "Basic",
};

const CONTACT_FIELDS: Array<[keyof ApplicationDetailsInput["contact"], string]> = [
  ["email", "Email"],
  ["phone", "Phone"],
  ["city", "City"],
  ["country", "Country"],
  ["linkedinUrl", "LinkedIn URL"],
  ["githubUrl", "GitHub URL"],
  ["portfolioUrl", "Portfolio URL"],
];

function intValue(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function ApplicationDetailsView() {
  const [details, setDetails] = useState<ApplicationDetailsInput>(EMPTY);
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchApplicationDetails()
      .then((loaded) => {
        if (!loaded) return;
        const { version, updatedAt: _updatedAt, ...input } = loaded;
        setDetails(input);
        setSavedVersion(version);
      })
      .catch((caught: ApiError) => setError(caught.message));
  }, []);

  function update<K extends keyof ApplicationDetailsInput>(key: K, value: ApplicationDetailsInput[K]) {
    setDetails((current) => ({ ...current, [key]: value }));
  }

  function updateItem<K extends "education" | "certifications" | "spokenLanguages">(
    key: K,
    index: number,
    patch: Partial<ApplicationDetailsInput[K][number]>,
  ) {
    setDetails((current) => ({
      ...current,
      [key]: current[key].map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  }

  function removeItem(key: "education" | "certifications" | "spokenLanguages", index: number) {
    setDetails((current) => ({ ...current, [key]: current[key].filter((_, i) => i !== index) }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      // Rows left blank are dropped rather than rejected.
      const saved = await saveApplicationDetails({
        ...details,
        education: details.education.filter((item) => item.institution.trim()),
        certifications: details.certifications.filter((item) => item.name.trim()),
        spokenLanguages: details.spokenLanguages.filter((item) => item.language.trim()),
      });
      const { version, updatedAt: _updatedAt, ...input } = saved;
      setDetails(input);
      setSavedVersion(version);
      setNotice("Application details saved.");
    } catch (caught) {
      setError((caught as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  const salary = details.salaryExpectation;

  return (
    <div>
      <p className="lede">
        What application forms ask for beyond your profile. These details fill in documents and
        form answers, and contact details are never sent to an AI provider.
      </p>
      {error ? <div className="error">{error}</div> : null}
      {notice ? <div className="notice">{notice}</div> : null}

      <section className="article-card">
        <h3>Contact</h3>
        <div className="grid-2">
          {CONTACT_FIELDS.map(([key, label]) => (
            <label className="field" key={key}>
              {label}
              <input
                value={details.contact[key]}
                onChange={(event) => update("contact", { ...details.contact, [key]: event.target.value })}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="article-card">
        <h3>Work authorization and availability</h3>
        <label className="field">
          Work authorization, in your words
          <textarea
            value={details.workAuthorization}
            placeholder="e.g. Brazilian citizen, works as a contractor; no US work permit"
            onChange={(event) => update("workAuthorization", event.target.value)}
          />
        </label>
        <div className="grid-2">
          <label className="field">
            Needs visa sponsorship
            <select
              value={details.requiresVisaSponsorship === null ? "" : String(details.requiresVisaSponsorship)}
              onChange={(event) =>
                update("requiresVisaSponsorship", event.target.value === "" ? null : event.target.value === "true")
              }
            >
              <option value="">Not answered</option>
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </label>
          <label className="field">
            Notice period
            <input
              value={details.noticePeriod}
              placeholder="e.g. 30 days"
              onChange={(event) => update("noticePeriod", event.target.value)}
            />
          </label>
          <label className="field">
            Time zone
            <input
              value={details.timeZone}
              placeholder="e.g. America/Sao_Paulo (UTC-3)"
              onChange={(event) => update("timeZone", event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="article-card">
        <h3>Salary expectation</h3>
        <div className="grid-2">
          <label className="field">
            Amount
            <input
              inputMode="numeric"
              value={salary?.amount ?? ""}
              onChange={(event) => {
                const amount = intValue(event.target.value);
                update(
                  "salaryExpectation",
                  amount === null ? null : { amount, currency: salary?.currency ?? "USD", period: salary?.period ?? "MONTH" },
                );
              }}
            />
          </label>
          <label className="field">
            Currency
            <input
              value={salary?.currency ?? "USD"}
              maxLength={3}
              disabled={!salary}
              onChange={(event) => salary && update("salaryExpectation", { ...salary, currency: event.target.value.toUpperCase() })}
            />
          </label>
          <label className="field">
            Per
            <select
              value={salary?.period ?? "MONTH"}
              disabled={!salary}
              onChange={(event) =>
                salary &&
                update("salaryExpectation", { ...salary, period: event.target.value as (typeof SALARY_PERIODS)[number] })
              }
            >
              {SALARY_PERIODS.map((period) => (
                <option key={period} value={period}>
                  {period === "MONTH" ? "Month" : "Year"}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="article-card">
        <h3>Spoken languages</h3>
        {details.spokenLanguages.map((item: SpokenLanguage, index) => (
          <div className="grid-2" key={index} data-testid="language-row">
            <label className="field">
              Language
              <input value={item.language} onChange={(event) => updateItem("spokenLanguages", index, { language: event.target.value })} />
            </label>
            <label className="field">
              Level
              <select
                value={item.level}
                onChange={(event) => updateItem("spokenLanguages", index, { level: event.target.value as SpokenLanguageLevel })}
              >
                {SPOKEN_LANGUAGE_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {LEVEL_LABELS[level]}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn ghost" style={{ alignSelf: "end", justifySelf: "start" }} type="button" onClick={() => removeItem("spokenLanguages", index)}>
              Remove
            </button>
          </div>
        ))}
        <button
          className="btn ghost"
          type="button"
          onClick={() => update("spokenLanguages", [...details.spokenLanguages, { language: "", level: "FLUENT" }])}
        >
          Add language
        </button>
      </section>

      <section className="article-card">
        <h3>Education</h3>
        {details.education.map((item: Education, index) => (
          <div className="grid-2" key={index} data-testid="education-row">
            <label className="field">
              Institution
              <input value={item.institution} onChange={(event) => updateItem("education", index, { institution: event.target.value })} />
            </label>
            <label className="field">
              Degree
              <input value={item.degree} onChange={(event) => updateItem("education", index, { degree: event.target.value })} />
            </label>
            <label className="field">
              Field of study
              <input value={item.field} onChange={(event) => updateItem("education", index, { field: event.target.value })} />
            </label>
            <label className="field">
              Start year
              <input
                inputMode="numeric"
                value={item.startYear ?? ""}
                onChange={(event) => updateItem("education", index, { startYear: intValue(event.target.value) })}
              />
            </label>
            <label className="field">
              End year
              <input
                inputMode="numeric"
                value={item.endYear ?? ""}
                onChange={(event) => updateItem("education", index, { endYear: intValue(event.target.value) })}
              />
            </label>
            <button className="btn ghost" style={{ alignSelf: "end", justifySelf: "start" }} type="button" onClick={() => removeItem("education", index)}>
              Remove
            </button>
          </div>
        ))}
        <button
          className="btn ghost"
          type="button"
          onClick={() =>
            update("education", [...details.education, { institution: "", degree: "", field: "", startYear: null, endYear: null }])
          }
        >
          Add education
        </button>
      </section>

      <section className="article-card">
        <h3>Certifications</h3>
        {details.certifications.map((item: Certification, index) => (
          <div className="grid-2" key={index} data-testid="certification-row">
            <label className="field">
              Name
              <input value={item.name} onChange={(event) => updateItem("certifications", index, { name: event.target.value })} />
            </label>
            <label className="field">
              Issuer
              <input value={item.issuer} onChange={(event) => updateItem("certifications", index, { issuer: event.target.value })} />
            </label>
            <label className="field">
              Year
              <input
                inputMode="numeric"
                value={item.year ?? ""}
                onChange={(event) => updateItem("certifications", index, { year: intValue(event.target.value) })}
              />
            </label>
            <button className="btn ghost" style={{ alignSelf: "end", justifySelf: "start" }} type="button" onClick={() => removeItem("certifications", index)}>
              Remove
            </button>
          </div>
        ))}
        <button
          className="btn ghost"
          type="button"
          onClick={() => update("certifications", [...details.certifications, { name: "", issuer: "", year: null }])}
        >
          Add certification
        </button>
      </section>

      <div className="actions">
        {savedVersion !== null ? <span className="status">Version {savedVersion}</span> : null}
        <button className="btn primary" type="button" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save application details"}
        </button>
      </div>
    </div>
  );
}
