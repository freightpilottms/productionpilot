"use client";

import { useCallback, useEffect, useState } from "react";

export default function IzvodiViewer({ racun }) {
  const [data, setData] = useState([]);
  const [broj, setBroj] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadLatest = useCallback(async () => {
    setLoading(true);
    const res = await fetch(
      `/api/racuni?mode=izvod&racun=${encodeURIComponent(racun)}&action=latest`
    );
    const json = await res.json();

    setData(json.rows || []);
    setBroj(json.broj);
    setLoading(false);
  }, [racun]);

  useEffect(() => {
    if (racun) loadLatest();
  }, [racun, loadLatest]);

  const loadNext = async () => {
    if (!broj) return;
    setLoading(true);

    const res = await fetch(
      `/api/racuni?mode=izvod&racun=${encodeURIComponent(racun)}&broj=${encodeURIComponent(
        broj
      )}&action=next`
    );
    const json = await res.json();

    if (json.broj) {
      setData(json.rows || []);
      setBroj(json.broj);
    }

    setLoading(false);
  };

  const loadPrev = async () => {
    if (!broj) return;
    setLoading(true);

    const res = await fetch(
      `/api/racuni?mode=izvod&racun=${encodeURIComponent(racun)}&broj=${encodeURIComponent(
        broj
      )}&action=prev`
    );
    const json = await res.json();

    if (json.broj) {
      setData(json.rows || []);
      setBroj(json.broj);
    }

    setLoading(false);
  };

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-3">
        <button onClick={loadPrev} className="btn">←</button>
        <div className="font-bold">Izvod #{broj}</div>
        <button onClick={loadNext} className="btn">→</button>
      </div>

      {loading && <div className="text-center">Učitavanje...</div>}

      <div className="space-y-2">
        {data.map((row, i) => (
          <div key={i} className="p-3 rounded-xl bg-white shadow flex justify-between">
            
            <div>
              <div className="font-medium">{row.Subjekt}</div>
              <div className="text-xs text-gray-500">
                {new Date(row.DatumDokumenta).toLocaleDateString()}
              </div>
            </div>

            <div className="text-right">
              {row.Uplate > 0 && (
                <div className="text-green-600 font-semibold">
                  +{row.Uplate.toFixed(2)}
                </div>
              )}

              {row.Isplate > 0 && (
                <div className="text-red-600 font-semibold">
                  -{row.Isplate.toFixed(2)}
                </div>
              )}
            </div>

          </div>
        ))}
      </div>
    </div>
  );
}
