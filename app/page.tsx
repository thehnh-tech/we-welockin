"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getPseudo, setPseudo, clearPseudo } from "@/lib/cookies";

type RoomView = {
  id: string;
  name: string;
  durationSec: number;
  startedAt: number;
  peerCount: number;
};

function shortId(len = 6): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < len; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return s;
}

function roomUrl(r: { id: string; name: string; durationSec: number; startedAt: number }) {
  const qs = new URLSearchParams({
    n: r.name,
    d: String(r.durationSec),
    s: String(r.startedAt),
  }).toString();
  return `/room/${r.id}?${qs}`;
}

export default function HomePage() {
  const router = useRouter();
  const [pseudo, setPseudoState] = useState<string | null>(null);
  const [pseudoInput, setPseudoInput] = useState("");
  const [rooms, setRooms] = useState<RoomView[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMinutes, setNewMinutes] = useState(25);

  useEffect(() => {
    setPseudoState(getPseudo());
  }, []);

  useEffect(() => {
    if (!pseudo) return;
    let alive = true;
    const fetchRooms = async () => {
      try {
        const res = await fetch("/api/rooms", { cache: "no-store" });
        const data = await res.json();
        if (alive) setRooms(data.rooms ?? []);
      } catch {}
    };
    fetchRooms();
    const t = setInterval(fetchRooms, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pseudo]);

  const submitPseudo = (e: React.FormEvent) => {
    e.preventDefault();
    const v = pseudoInput.trim();
    if (!v) return;
    setPseudo(v);
    setPseudoState(v);
  };

  const createRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const id = shortId();
    const name = newName.trim() || "Study session";
    const durationSec = Math.max(60, Math.floor(newMinutes) * 60);
    const startedAt = Date.now();
    router.push(roomUrl({ id, name, durationSec, startedAt }));
  };

  if (!pseudo) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <form
          onSubmit={submitPseudo}
          className="w-full max-w-sm bg-panel rounded-xl p-6 shadow-xl space-y-4"
        >
          <div>
            <h1 className="text-2xl font-bold">WeLockInStudy</h1>
            <p className="text-sm text-white/60 mt-1">
              Choisis un pseudo pour commencer.
            </p>
          </div>
          <input
            autoFocus
            value={pseudoInput}
            onChange={(e) => setPseudoInput(e.target.value)}
            placeholder="Ton pseudo"
            maxLength={30}
            className="w-full px-3 py-2 rounded-lg bg-bg border border-white/10 focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!pseudoInput.trim()}
            className="w-full py-2 rounded-lg bg-accent hover:brightness-110 font-medium"
          >
            Continuer
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">WeLockInStudy</h1>
        <div className="text-sm text-white/70 flex items-center gap-3">
          <span>
            Salut, <span className="text-white font-medium">{pseudo}</span>
          </span>
          <button
            onClick={() => {
              clearPseudo();
              setPseudoState(null);
            }}
            className="text-white/40 hover:text-white underline"
          >
            changer
          </button>
        </div>
      </header>

      <section className="bg-panel rounded-xl p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4">Créer une room</h2>
        <form onSubmit={createRoom} className="flex flex-col md:flex-row gap-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nom (ex: Révisions math)"
            maxLength={60}
            className="flex-1 px-3 py-2 rounded-lg bg-bg border border-white/10 focus:outline-none focus:border-accent"
          />
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg border border-white/10">
            <span className="text-white/60 text-sm">Timer</span>
            <input
              type="number"
              min={1}
              max={480}
              value={newMinutes}
              onChange={(e) => setNewMinutes(Number(e.target.value))}
              className="w-20 bg-transparent focus:outline-none text-right"
            />
            <span className="text-white/60 text-sm">min</span>
          </div>
          <button
            type="submit"
            className="px-5 py-2 rounded-lg bg-accent hover:brightness-110 font-medium"
          >
            Créer & rejoindre
          </button>
        </form>
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Rooms publiques</h2>
          <button
            onClick={async () => {
              setLoading(true);
              try {
                const res = await fetch("/api/rooms", { cache: "no-store" });
                const data = await res.json();
                setRooms(data.rooms ?? []);
              } finally {
                setLoading(false);
              }
            }}
            className="text-sm text-white/60 hover:text-white"
          >
            {loading ? "..." : "↻"}
          </button>
        </div>
        {rooms.length === 0 ? (
          <p className="text-white/50 text-sm">
            Aucune room active. Crée-en une !
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {rooms.map((r) => (
              <li
                key={r.id}
                className="bg-panel rounded-xl p-4 flex items-center justify-between"
              >
                <div>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-white/50 mt-1">
                    {r.peerCount} {r.peerCount > 1 ? "participants" : "participant"} ·{" "}
                    {Math.round(r.durationSec / 60)} min
                  </div>
                </div>
                <button
                  onClick={() => router.push(roomUrl(r))}
                  className="px-4 py-2 rounded-lg bg-accent hover:brightness-110 text-sm font-medium"
                >
                  Rejoindre
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
