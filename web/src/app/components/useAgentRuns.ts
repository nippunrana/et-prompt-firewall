"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/base-path";
import type { Job } from "@/lib/demo-types";
import { MODES, type ModeKey } from "./RunResults";

// Two copies of the same agent on the same input, one with the firewall and one without, started together and
// polled until both finish. Shared by the inbox and every other input type. Closing the drawer never stops a run.
export function useAgentRuns() {
  const [jobs, setJobs] = useState<Partial<Record<ModeKey, Job>>>({});
  const [seconds, setSeconds] = useState<Partial<Record<ModeKey, number>>>({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const running = Object.values(jobs).some((j) => j?.status === "running");

  useEffect(() => () => timers.current.forEach(clearInterval), []);

  function reset() {
    setJobs({});
    setSeconds({});
  }

  // `request` is the body of POST /runs without the two switches, which each copy sets for itself
  async function start(request: Record<string, unknown>) {
    timers.current.forEach(clearInterval);
    timers.current = [];
    setJobs(Object.fromEntries(MODES.map((m) => [m.key, { status: "running", steps: [], result: null, error: null }])));
    setSeconds({});
    setDrawerOpen(true);

    const began = Date.now();
    const open = new Set<ModeKey>(MODES.map((m) => m.key));
    const tick = () => {
      const now = Math.round((Date.now() - began) / 1000);
      setSeconds((prev) => ({ ...prev, ...Object.fromEntries([...open].map((k) => [k, now])) }));
    };
    const clock = setInterval(tick, 1000);
    timers.current.push(clock);
    const finish = (key: ModeKey) => {
      tick();
      open.delete(key);
      if (open.size === 0) clearInterval(clock);
    };

    await Promise.all(MODES.map(async (m) => {
      const fail = (error: string) => { setJobs((j) => ({ ...j, [m.key]: { status: "error", steps: [], result: null, error } })); finish(m.key); };
      try {
        const response = await fetch(`${BASE_PATH}/api/runs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...request, firewall: m.firewall, guard: m.guard }),
        });
        const data = await response.json();
        if (!response.ok) return fail(data.error || "Could not start the run");
        const poll = setInterval(async () => {
          try {
            const job: Job & { error?: string } = await (await fetch(`${BASE_PATH}/api/runs/${data.id}`)).json();
            if (!job.status) { clearInterval(poll); return fail(job.error || "Run lost"); }
            setJobs((j) => ({ ...j, [m.key]: job }));
            if (job.status !== "running") { clearInterval(poll); finish(m.key); }
          } catch { /* a missed poll is retried on the next tick */ }
        }, 1500);
        timers.current.push(poll);
      } catch (e) {
        fail(e instanceof Error ? e.message : "Network error");
      }
    }));
  }

  return { jobs, seconds, running, drawerOpen, setDrawerOpen, closeDrawer, start, reset };
}
