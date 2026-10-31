"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronUp,
  CircleCheck,
  Code2,
  Copy,
  ExternalLink,
  EyeOff,
  Flame,
  FlaskConical,
  FolderOpen,
  Heart,
  Info,
  LoaderCircle,
  LockKeyhole,
  Maximize2,
  MessageCircle,
  Pause,
  Play,
  Radio,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
  WandSparkles,
  X,
} from "lucide-react";
import { AppHeader } from "./AppHeader";
import { Brand, ForgeMark } from "./Brand";
import { GameViewport, type GameViewportHandle } from "./GameViewport";
import { CandidatePreview, SamplePreview } from "./CandidatePreview";
import { EvidencePanel } from "./EvidencePanel";
import { Modal } from "./Modal";
import { ShowManager } from "./ShowManager";
import { api, ApiError, elapsed, errorMessage, shortHash } from "@/lib/api";
import { ruleDescription } from "@/lib/rule-copy";
import {
  retireFaultedLaw,
  type RuntimeRecoveryTarget,
} from "@/lib/runtime-recovery";
import { TwitchConnector } from "@/lib/twitch-client";
import { compileRuleSource, PRACTICE_RULE_SOURCE } from "@/game/rules";
import type {
  GameCheckpoint,
  GameSnapshot,
  WorkerRuntimeFaultContext,
} from "@/game/contracts";
import type {
  AuthorityLease,
  Candidate,
  GenerationJob,
  HostShowResponse,
  Proposal,
  ShowMode,
  ShowState,
} from "@/server/contracts";

interface ServiceStatus {
  generation: {
    configured: boolean;
    allowed: boolean;
    authorization: string;
    model: string;
    quota: {
      day: string;
      resetsAt: string;
      exempt: boolean;
      perUserLimit: number;
      globalLimit: number;
      userRemaining: number | null;
      globalRemaining: number | null;
      exhausted: boolean;
    } | null;
  };
  twitch: { configured: boolean };
  storage: string;
}
const CHAPTERS = [
  "The Broken Crossing",
  "The Counterweight Hall",
  "The Beacon Guardian",
];
const INSPIRATIONS = [
  "A still prop’s shadow becomes a solid bridge.",
  "A grounded prop creates a small step beside it.",
  "Nearby props glow when the courier approaches.",
];
const WORKING = new Set(["queued", "starting", "generating", "verifying"]);

export function Studio() {
  const [show, setShow] = useState<ShowState | null>(null);
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootAttempt, setBootAttempt] = useState(0);
  const [bootFailed, setBootFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [authority, setAuthority] = useState<AuthorityLease | null>(null);
  const [authorityIssue, setAuthorityIssue] = useState<string | null>(null);
  const [checkpointIssue, setCheckpointIssue] = useState<string | null>(null);
  const [faultIssue, setFaultIssue] = useState<string | null>(null);
  const [recoveringFault, setRecoveringFault] = useState(false);
  const [preview, setPreview] = useState<Candidate | null>(null);
  const [previewBaseline, setPreviewBaseline] = useState<GameCheckpoint | null>(
    null,
  );
  const [sampleOpen, setSampleOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [showManagerOpen, setShowManagerOpen] = useState(false);
  const [nextRound, setNextRound] = useState(false);
  const [chatState, setChatState] = useState<{
    status: string;
    message: string;
  } | null>(null);
  const game = useRef<GameViewportHandle>(null);
  const stage = useRef<HTMLDivElement>(null);
  const clientId = useRef("");
  const lease = useRef<AuthorityLease | null>(null);
  const lostAuthority = useRef(false);
  const renewAuthority = useRef<() => Promise<void>>(async () => undefined);
  const checkpointSaving = useRef(false);
  const pendingFault = useRef<{
    target: RuntimeRecoveryTarget;
    fault: WorkerRuntimeFaultContext;
    message: string;
  } | null>(null);
  const faultInFlight = useRef(false);
  const currentShow = useRef<ShowState | null>(null);
  const currentBusy = useRef<string | null>(null);
  const latestSnapshot = useRef<GameSnapshot | null>(null);
  const snapshotAt = useRef(0);
  const broadcast = useRef<BroadcastChannel | null>(null);
  const twitch = useRef<TwitchConnector | null>(null);
  const sound = useRef<AudioContext | null>(null);
  currentShow.current = show;
  currentBusy.current = busy;
  lease.current = authority;
  const practiceProgram = useMemo(
    () => compileRuleSource(PRACTICE_RULE_SOURCE),
    [],
  );

  const notify = useCallback((message: string) => {
    setToast(message);
  }, []);
  const refresh = useCallback(async () => {
    try {
      const result = await api<HostShowResponse>("/api/shows/current");
      setShow((current) =>
        current?.id === result.show.id &&
        current.revision > result.show.revision
          ? current
          : result.show,
      );
      return result.show;
    } catch (e) {
      if (!(e instanceof ApiError && (e.status === 401 || e.status === 404)))
        throw e;
      return null;
    }
  }, []);

  const saveCheckpoint = useCallback(async (checkpoint?: GameCheckpoint) => {
    const current = currentShow.current,
      currentLease = lease.current;
    if (
      !current ||
      !currentLease ||
      currentLease.expiresAt <= Date.now() ||
      currentBusy.current ||
      pendingFault.current ||
      checkpointSaving.current
    )
      return;
    checkpointSaving.current = true;
    try {
      const saved = checkpoint || (await game.current?.checkpoint());
      if (!saved || pendingFault.current || currentBusy.current) return;
      await api<HostShowResponse>(`/api/shows/${current.id}/checkpoint`, {
        clientId: clientId.current,
        epoch: currentLease.epoch,
        checkpoint: saved,
      });
      if (currentShow.current?.id === current.id) setCheckpointIssue(null);
    } catch (error) {
      if (currentShow.current?.id === current.id && !pendingFault.current)
        setCheckpointIssue(
          `Progress has not been saved. ${errorMessage(error)} The last acknowledged checkpoint is still available.`,
        );
    } finally {
      checkpointSaving.current = false;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    clientId.current = crypto.randomUUID();
    const boot = async () => {
      setLoading(true);
      setBootFailed(false);
      setError(null);
      try {
        const [session, service] = await Promise.all([
          api<HostShowResponse>(
            "/api/shows/current",
            undefined,
            controller.signal,
          ).catch((e) => {
            if (e instanceof ApiError && [401, 404].includes(e.status))
              return null;
            throw e;
          }),
          api<ServiceStatus>("/api/status", undefined, controller.signal),
        ]);
        if (alive) {
          setShow(session?.show || null);
          setStatus(service);
        }
        const authError = new URLSearchParams(window.location.search).get(
          "authError",
        );
        if (alive && authError)
          setError(
            "Twitch could not finish connecting. Your world is safe; try Connect Twitch again.",
          );
      } catch (e) {
        if (alive) {
          setError(errorMessage(e));
          setBootFailed(true);
        }
      } finally {
        if (alive) setLoading(false);
      }
    };
    void boot();
    return () => {
      alive = false;
      controller.abort();
      twitch.current?.stop();
      void sound.current?.close();
    };
  }, [bootAttempt]);

  useEffect(() => {
    if (!show?.id) return;
    window.scrollTo({ top: 0, behavior: "instant" });
    let alive = true;
    const showId = show.id;
    let acquired: AuthorityLease | null = null;
    let renewing = false;
    const loseControl = (message: string) => {
      lease.current = null;
      lostAuthority.current = true;
      game.current?.pause(true);
      setAuthority(null);
      setPaused(true);
      setAuthorityIssue(message);
    };
    const renew = async () => {
      if (!alive || renewing) return;
      renewing = true;
      try {
        const result = await api<HostShowResponse>(
          `/api/shows/${showId}/lease`,
          { clientId: clientId.current },
          AbortSignal.timeout(10000),
        );
        if (alive) {
          acquired = result.show.lease;
          lease.current = result.show.lease;
          setAuthority(result.show.lease);
          setAuthorityIssue(null);
          if (lostAuthority.current) {
            if (result.show.checkpoint && !pendingFault.current)
              game.current?.restore(result.show.checkpoint);
            setShow(result.show);
            setError(null);
            setPaused(true);
            lostAuthority.current = false;
            notify(
              "Control recovered from the saved checkpoint. Resume when ready.",
            );
          }
        }
      } catch (e) {
        if (alive) {
          const held = lease.current;
          if (
            (e instanceof ApiError && [401, 403, 409].includes(e.status)) ||
            !held ||
            held.expiresAt <= Date.now()
          )
            loseControl(
              `${errorMessage(e)} The game is paused; take control here to recover the saved world.`,
            );
          else
            setAuthorityIssue(
              "Connection interrupted. Your control lease is still valid; LIVEFORGE is retrying in the background.",
            );
        }
      } finally {
        renewing = false;
      }
    };
    renewAuthority.current = renew;
    const release = () => {
      const held = lease.current || acquired;
      if (!held || held.clientId !== clientId.current) return;
      void fetch(`/api/shows/${showId}/lease/release`, {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          "x-idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          clientId: held.clientId,
          epoch: held.epoch,
        }),
      }).catch(() => undefined);
    };
    window.addEventListener("pagehide", release);
    void renew();
    const visible = () => {
      if (document.visibilityState !== "visible") return;
      if (lease.current && lease.current.expiresAt <= Date.now())
        loseControl(
          "Control expired while the studio was away. Recover the saved world before continuing.",
        );
      game.current?.requestHeartbeat();
      void renew();
    };
    document.addEventListener("visibilitychange", visible);
    const expiryTimer = setInterval(() => {
      if (lease.current && lease.current.expiresAt <= Date.now()) {
        loseControl(
          "Control expired. The game is paused; take control here to recover the saved world.",
        );
      }
    }, 1000);
    const pollTimer = setInterval(() => {
      void refresh().catch(() => {
        /* lease renewal owns connectivity recovery */
      });
    }, 2500);
    const checkpointTimer = setInterval(() => {
      void saveCheckpoint();
    }, 10000);
    const channel = new BroadcastChannel(`liveforge-${showId}`);
    broadcast.current = channel;
    channel.onmessage = (event) => {
      if (event.data?.type === "hello" && latestSnapshot.current)
        publishFrame(latestSnapshot.current, channel);
    };
    return () => {
      alive = false;
      release();
      renewAuthority.current = async () => undefined;
      window.removeEventListener("pagehide", release);
      document.removeEventListener("visibilitychange", visible);
      clearInterval(expiryTimer);
      clearInterval(pollTimer);
      clearInterval(checkpointTimer);
      channel.close();
      broadcast.current = null;
    };
  }, [show?.id, refresh, notify, saveCheckpoint]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  function publishFrame(frame: GameSnapshot, channel = broadcast.current) {
    const current = currentShow.current;
    const active = current?.candidates.find(
      (candidate) => candidate.id === current.activeCandidateId,
    );
    const author = current?.proposals.find(
      (proposal) => proposal.id === active?.proposalId,
    )?.author;
    channel?.postMessage({
      type: "frame",
      snapshot: frame,
      mode: current?.mode,
      phase: current?.phase,
      active: active
        ? {
            name: active.program.name,
            description: ruleDescription(
              active.program.description,
              active.sourceHash,
            ),
            author,
          }
        : null,
    });
  }

  const onSnapshot = (frame: GameSnapshot) => {
    latestSnapshot.current = frame;
    publishFrame(frame);
    if (performance.now() - snapshotAt.current > 600) {
      snapshotAt.current = performance.now();
      setSnapshot(frame);
    }
  };

  const onGameReady = () => {
    const current = currentShow.current;
    if (current?.checkpoint) game.current?.restore(current.checkpoint);
    else {
      const active = current?.candidates.find(
        (candidate) => candidate.id === current.activeCandidateId,
      );
      if (active) game.current?.activate(active.program, active.sourceHash);
    }
    game.current?.pause(paused || !lease.current);
  };

  const onCheckpoint = (checkpoint: GameCheckpoint) => {
    void saveCheckpoint(checkpoint);
  };

  const recoverRuntimeFault = async () => {
    const pending = pendingFault.current;
    if (!pending || faultInFlight.current) return;
    const held = lease.current;
    if (!held || held.expiresAt <= Date.now()) {
      setFaultIssue(
        "The law stopped safely, but retirement still needs to be saved. Take control here, then retry recovery.",
      );
      return;
    }
    faultInFlight.current = true;
    setRecoveringFault(true);
    try {
      const result = await retireFaultedLaw(
        { ...pending.target, clientId: clientId.current, epoch: held.epoch },
        pending.fault,
        pending.message,
      );
      if (currentShow.current?.id !== pending.target.showId) return;
      if (result.show.checkpoint) game.current?.restore(result.show.checkpoint);
      game.current?.pause(true);
      currentShow.current = result.show;
      setShow(result.show);
      pendingFault.current = null;
      setFaultIssue(null);
      setCheckpointIssue(null);
      setNextRound(true);
      notify(
        "Fault recovery saved. The current approved world is restored; resume when ready.",
      );
    } catch (error) {
      setFaultIssue(
        `The law stopped safely, but server recovery is not complete. ${errorMessage(error)} Retry before resuming.`,
      );
    } finally {
      faultInFlight.current = false;
      setRecoveringFault(false);
    }
  };

  const onGameFault = (message: string, fault?: WorkerRuntimeFaultContext) => {
    game.current?.pause(true);
    setPaused(true);
    if (!fault || !fault.artifactHash) {
      setError(message);
      return;
    }
    const current = currentShow.current,
      held = lease.current;
    if (!current) {
      setError(message);
      return;
    }
    pendingFault.current = {
      target: {
        showId: current.id,
        revision: current.revision,
        artifactHash: fault.artifactHash,
        candidateId: current.activeCandidateId,
        clientId: clientId.current,
        epoch: held?.epoch || 0,
      },
      fault,
      message,
    };
    setFaultIssue(
      "A generated law stopped. Restoring and saving the previous approved world…",
    );
    void recoverRuntimeFault();
  };

  const tone = (kind: "select" | "ready" | "activate") => {
    if (muted || !sound.current) return;
    const context = sound.current;
    const notes =
      kind === "activate"
        ? [220, 330, 440, 660]
        : kind === "ready"
          ? [440, 660]
          : [330];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator(),
        gain = context.createGain();
      const start = context.currentTime + index * 0.06;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.035, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.45);
    });
  };
  const toggleAudio = async () => {
    if (muted) {
      sound.current ||= new AudioContext();
      await sound.current.resume();
    }
    setMuted((value) => !value);
  };

  const action = async (name: string, callback: () => Promise<void>) => {
    if (busy) return;
    if (pendingFault.current && name !== "takeover") {
      setFaultIssue(
        "Finish saving fault recovery before changing the show. Retry recovery or take control here.",
      );
      return;
    }
    setBusy(name);
    setError(null);
    try {
      await callback();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
      if (["generate", "revise"].includes(name))
        void api<ServiceStatus>("/api/status")
          .then(setStatus)
          .catch(() => undefined);
    }
  };

  const createShow = (mode: ShowMode) =>
    action("create", async () => {
      twitch.current?.stop();
      twitch.current = null;
      setChatState(null);
      const result = await api<HostShowResponse>("/api/shows", { mode });
      setShow(result.show);
      setAuthority(null);
      setSelectedId(null);
      setSnapshot(null);
      setAuthorityIssue(null);
      setCheckpointIssue(null);
      setFaultIssue(null);
      pendingFault.current = null;
      setNextRound(false);
      setStatus(await api<ServiceStatus>("/api/status"));
      window.history.replaceState(null, "", "/studio");
      window.scrollTo({ top: 0, behavior: "instant" });
    });

  const resumeShow = async (resumed: ShowState) => {
    twitch.current?.stop();
    twitch.current = null;
    setChatState(null);
    setShow(resumed);
    setAuthority(null);
    setSnapshot(null);
    setAuthorityIssue(null);
    setCheckpointIssue(null);
    setFaultIssue(null);
    pendingFault.current = null;
    setSelectedId(null);
    setNextRound(false);
    setPreview(null);
    setPaused(false);
    setError(null);
    setStatus(await api<ServiceStatus>("/api/status"));
  };

  const submitProposal = (event: React.FormEvent) => {
    event.preventDefault();
    if (!show || !draft.trim()) return;
    void action("proposal", async () => {
      const result = await api<HostShowResponse>(
        `/api/shows/${show.id}/proposals`,
        { text: draft.trim(), author: "Host" },
      );
      setShow(result.show);
      setSelectedId(result.show.proposals.at(-1)?.id || null);
      setDraft("");
      setNextRound(true);
      tone("select");
      notify("Your practice idea is in the forge.");
    });
  };

  const generate = () => {
    if (!show || !selectedId) return;
    void action("generate", async () => {
      const result = await api<HostShowResponse>(
        `/api/shows/${show.id}/generate`,
        { proposalId: selectedId },
      );
      setShow(result.show);
      setNextRound(false);
      tone("select");
    });
  };

  const openPreview = async (candidate: Candidate) => {
    await action("preview", async () => {
      game.current?.pause(true);
      try {
        const checkpoint = await game.current?.checkpoint();
        setPreviewBaseline(checkpoint || null);
        setPreview(candidate);
        tone("ready");
      } catch (e) {
        game.current?.pause(paused);
        throw e;
      }
    });
  };

  const approve = async (checkpoint: GameCheckpoint) => {
    if (!show || !preview) return;
    setBusy("approve");
    try {
      const result = await api<HostShowResponse>(
        `/api/shows/${show.id}/candidates/${preview.id}/approve`,
        {
          sourceHash: preview.sourceHash,
          programHash: preview.programHash,
          previewCheckpoint: checkpoint,
        },
      );
      setShow(result.show);
      setPreview(null);
      notify("Version approved. Activate it when you are ready.");
      tone("ready");
    } finally {
      setBusy(null);
    }
  };

  const activate = (candidate: Candidate) =>
    action("activate", async () => {
      if (!show || !game.current || !authority)
        throw new Error(
          "The active game tab must hold its authority lease before activation.",
        );
      game.current.pause(true);
      try {
        const checkpoint = await game.current.checkpoint();
        const player = checkpoint.snapshot.entities.find(
          (entity) => entity.kind === "player",
        );
        if (!player?.grounded)
          throw new Error(
            "Land on a platform before activating. A grounded position gives your world a safe recovery checkpoint.",
          );
        const result = await api<HostShowResponse>(
          `/api/shows/${show.id}/activate`,
          {
            candidateId: candidate.id,
            sourceHash: candidate.sourceHash,
            programHash: candidate.programHash,
            clientId: clientId.current,
            epoch: authority.epoch,
            checkpoint,
          },
        );
        if (result.show.checkpoint)
          game.current.restore(result.show.checkpoint);
        setShow(result.show);
        setNextRound(false);
        notify(`${candidate.program.name} is part of your world.`);
        tone("activate");
      } finally {
        game.current.pause(paused);
      }
    });

  const rollback = () =>
    action("rollback", async () => {
      if (!show || !authority) return;
      game.current?.pause(true);
      try {
        const result = await api<HostShowResponse>(
          `/api/shows/${show.id}/rollback`,
          { clientId: clientId.current, epoch: authority.epoch },
        );
        if (result.show.checkpoint)
          game.current?.restore(result.show.checkpoint);
        setShow(result.show);
        setRecoveryOpen(false);
        setNextRound(true);
        notify("Previous law and activation checkpoint restored.");
      } finally {
        game.current?.pause(paused);
      }
    });

  const takeControl = () =>
    action("takeover", async () => {
      if (!show) return;
      const result = await api<HostShowResponse>(
        `/api/shows/${show.id}/lease`,
        { clientId: clientId.current, takeover: true },
      );
      if (result.show.checkpoint) game.current?.restore(result.show.checkpoint);
      setShow(result.show);
      lease.current = result.show.lease;
      setAuthority(result.show.lease);
      lostAuthority.current = false;
      setAuthorityIssue(null);
      setPaused(Boolean(pendingFault.current));
      setError(null);
      notify(
        "Control transferred here. Other tabs can no longer change this world.",
      );
      if (pendingFault.current) await recoverRuntimeFault();
    });

  const loadReused = () =>
    action("sample", async () => {
      if (!show) return;
      const result = await api<HostShowResponse>(
        `/api/shows/${show.id}/practice/sample`,
        {},
      );
      setShow(result.show);
      setNextRound(false);
      notify(
        "Previously generated artifact loaded. No AI call was made in this run.",
      );
    });

  const reject = async () => {
    if (!show || !preview) return;
    setBusy("reject");
    try {
      const result = await api<HostShowResponse>(
        `/api/shows/${show.id}/candidates/${preview.id}/reject`,
        { reason: "The creator rejected this version after preview." },
      );
      setShow(result.show);
      setPreview(null);
      setNextRound(true);
      notify("Version rejected. Your live world is unchanged.");
    } finally {
      setBusy(null);
    }
  };
  const revise = async (revision: string) => {
    if (!show || !preview) return;
    setBusy("revise");
    try {
      const result = await api<HostShowResponse>(
        `/api/shows/${show.id}/generate`,
        {
          proposalId: preview.proposalId,
          priorCandidateId: preview.id,
          revision,
        },
      );
      setShow(result.show);
      setPreview(null);
      setNextRound(false);
      notify(
        "A fresh revision is being generated. Original credit is preserved.",
      );
    } finally {
      setBusy(null);
      void api<ServiceStatus>("/api/status")
        .then(setStatus)
        .catch(() => undefined);
    }
  };

  const moderate = (proposal: Proposal, hidden: boolean) =>
    action("moderate", async () => {
      if (!show) return;
      const result = await api<HostShowResponse>(
        `/api/shows/${show.id}/proposals/${proposal.id}/moderate`,
        { status: hidden ? "hidden" : "open" },
      );
      setShow(result.show);
      if (hidden && selectedId === proposal.id) setSelectedId(null);
      notify(
        hidden
          ? "Idea hidden from the public shortlist."
          : "Idea restored to the shortlist.",
      );
    });
  const toggleIntake = () =>
    action("intake", async () => {
      if (!show) return;
      const result = await api<HostShowResponse>(
        `/api/shows/${show.id}/round`,
        { votingOpen: !show.votingOpen },
      );
      setShow(result.show);
      notify(
        result.show.votingOpen
          ? "Proposals and support are open."
          : "The shortlist is closed. Existing ideas are preserved.",
      );
    });

  const connectChat = () => {
    if (!show) return;
    twitch.current?.stop();
    twitch.current = new TwitchConnector(
      show.id,
      (state, message) => setChatState({ status: state, message }),
      () => {
        void refresh();
      },
    );
    twitch.current.start();
  };

  const copy = async (text: string, message = "Copied to clipboard.") => {
    try {
      await navigator.clipboard.writeText(text);
      notify(message);
    } catch {
      notify("Clipboard unavailable. Select and copy the text instead.");
    }
  };
  const latestJob = show?.jobs.at(-1);
  const activeCandidate = show?.candidates.find(
    (candidate) => candidate.id === show.activeCandidateId,
  );
  const candidate = show?.candidates.find(
    (item) => item.id === latestJob?.candidateId,
  );
  const selected = show?.proposals.find(
    (proposal) => proposal.id === selectedId,
  );
  const isWorking = Boolean(latestJob && WORKING.has(latestJob.status));
  const candidateReady =
    candidate && !candidate.activatedAt && latestJob?.status === "ready";
  const currentChapter = Math.min(2, snapshot?.checkpoint || 0);
  const publicOrigin =
    typeof window === "undefined" ? "" : window.location.origin;
  const chat = chatState || {
    status: "disconnected",
    message: show?.twitch.channelLogin
      ? `Reconnect to @${show.twitch.channelLogin} in this tab to receive new ideas. Messages during a connection gap cannot be recovered.`
      : "Authorize your channel, then listen for new ideas.",
  };

  if (loading)
    return (
      <div className="studio-page">
        <AppHeader />
        <main className="studio-loading" role="status">
          <span className="ember-loader" />
          Opening your studio…
        </main>
      </div>
    );

  if (bootFailed)
    return (
      <div className="studio-page">
        <AppHeader />
        <main className="setup-wrap">
          <div className="setup-heading">
            <p className="eyebrow">A MOMENT TO RECONNECT</p>
            <h1>Let’s reconnect.</h1>
            <p role="alert">
              {error || "The studio couldn’t load your saved show."}
            </p>
            <button
              className="button button-primary"
              onClick={() => setBootAttempt((attempt) => attempt + 1)}
            >
              <RotateCcw size={16} /> Retry opening studio
            </button>
          </div>
        </main>
      </div>
    );

  if (!show)
    return (
      <div className="studio-page">
        <AppHeader />
        <main className="setup-wrap">
          <div className="setup-heading">
            <p className="eyebrow">WELCOME TO YOUR NEXT GAME NIGHT</p>
            <h1>
              A world waiting
              <br />
              for your community.
            </h1>
            <p>
              Carry the last ember through a broken sky. Let your audience
              invent the laws that help you find a way.
            </p>
          </div>
          {error && <Notice message={error} onClose={() => setError(null)} />}
          <div className="setup-grid">
            <div className="setup-scene">
              <GameViewport presentation="world" showHud={false} />
              <div className="setup-scene-copy">
                <p className="eyebrow">THE FIRST ADVENTURE</p>
                <h2>The Last Light</h2>
                <p>Three encounters. One ember. Your rules.</p>
              </div>
            </div>
            <div className="setup-options">
              <div className="setup-option">
                <h3>
                  <Radio size={20} />
                  Bring your community
                </h3>
                <p>
                  Connect your Twitch channel. Viewers propose with{" "}
                  <code>!forge</code>, support with <code>!back</code>, and you
                  choose what becomes real.
                </p>
                <button
                  className="button button-primary button-full"
                  disabled={Boolean(busy)}
                  onClick={() => void createShow("twitch")}
                >
                  {busy ? (
                    <LoaderCircle size={15} className="spinner" />
                  ) : (
                    <Radio size={15} />
                  )}{" "}
                  Set up a Twitch show <ArrowRight size={15} />
                </button>
              </div>
              <div className="setup-option practice">
                <h3>
                  <FlaskConical size={20} />
                  Find your feet first
                </h3>
                <p>
                  Explore the game, write a practice idea, and try the complete
                  preview and approval flow with a labeled sample.
                </p>
                <button
                  className="button button-outline button-full"
                  disabled={Boolean(busy)}
                  onClick={() => void createShow("practice")}
                >
                  {busy === "create" ? (
                    <>
                      <LoaderCircle size={15} className="spinner" />
                      Opening your studio…
                    </>
                  ) : (
                    <>
                      Enter practice <ArrowRight size={15} />
                    </>
                  )}
                </button>
              </div>
              <p className="setup-disclosure">
                <ShieldCheck size={14} />
                Every new law passes independent checks and waits for your
                approval. Recovery stays within reach.
              </p>
            </div>
          </div>
        </main>
      </div>
    );

  return (
    <div className="studio-page">
      <a className="skip-link" href="#forge">
        Skip to the forge
      </a>
      <AppHeader>
        <div className="show-meta">
          <span
            className={`status-dot ${chat?.status === "connected" ? "mint" : "brass"}`}
          />
          <span>
            {show.mode === "practice"
              ? "Practice studio"
              : chat?.status === "connected"
                ? show.twitch.channelLogin || "Twitch connected"
                : "Twitch awaiting connection"}
          </span>
        </div>
        <button
          className="button button-outline button-small"
          onClick={() => setShowManagerOpen(true)}
        >
          <FolderOpen size={13} /> Your shows
        </button>
      </AppHeader>
      <main className="studio-main">
        <div className="studio-heading">
          <div>
            <p className="eyebrow">YOUR WORLD. THEIR WHAT-IFS.</p>
            <div className="title-line">
              <h1>
                The Last Light<span style={{ color: "var(--coral)" }}>.</span>
              </h1>
              <span
                className={`pill ${show.mode === "practice" ? "pill-brass" : "pill-mint"}`}
              >
                <span className="status-dot" />
                {show.mode === "practice" ? "PRACTICE" : "TWITCH SHOW"}
              </span>
            </div>
          </div>
          <div className="button-group">
            <button
              className="button button-quiet"
              onClick={() => setShowManagerOpen(true)}
            >
              <FolderOpen size={15} />
              Your shows
            </button>
            <button
              className="button button-quiet"
              onClick={() => setEvidenceOpen(true)}
            >
              <Code2 size={15} />
              Behind the law
            </button>
            <button
              className="button button-outline"
              onClick={() => setShareOpen(true)}
            >
              <ExternalLink size={15} />
              Open outputs
            </button>
          </div>
        </div>
        {error && (
          <Notice
            message={error}
            onClose={() => setError(null)}
            action={
              !authority ? (
                <button
                  className="button button-outline button-small"
                  disabled={Boolean(busy)}
                  onClick={() => void takeControl()}
                >
                  Take control here
                </button>
              ) : undefined
            }
          />
        )}
        {authorityIssue && (
          <div className="notice notice-error recovery-notice" role="alert">
            <LockKeyhole size={20} />
            <div>
              <strong>
                {authority
                  ? "Connection needs attention"
                  : "World control interrupted"}
              </strong>
              <p>{authorityIssue}</p>
            </div>
            {!authority && (
              <button
                className="button button-outline button-small"
                disabled={Boolean(busy)}
                onClick={() => void takeControl()}
              >
                Take control here
              </button>
            )}
          </div>
        )}
        {faultIssue && (
          <div className="notice notice-error recovery-notice" role="alert">
            <RotateCcw size={20} />
            <div>
              <strong>World paused for recovery</strong>
              <p>{faultIssue}</p>
            </div>
            <button
              className="button button-outline button-small"
              disabled={recoveringFault || !authority}
              onClick={() => void recoverRuntimeFault()}
            >
              {recoveringFault ? "Saving recovery…" : "Retry recovery"}
            </button>
          </div>
        )}
        {checkpointIssue && (
          <div className="notice recovery-notice" role="alert">
            <Info size={20} />
            <div>
              <strong>Progress needs saving</strong>
              <p>{checkpointIssue}</p>
            </div>
            <button
              className="button button-outline button-small"
              disabled={!authority || Boolean(busy) || Boolean(faultIssue)}
              onClick={() => void saveCheckpoint()}
            >
              Retry save
            </button>
          </div>
        )}
        {show.mode === "twitch" && chat?.status !== "connected" && (
          <div className="connection-strip">
            <div className="connection-info">
              <Radio size={20} />
              <div>
                <h3>Your community is one connection away.</h3>
                <p>
                  {chat?.message ||
                    "Authorize your channel, then listen for new ideas."}
                </p>
              </div>
            </div>
            <div className="button-group">
              <a
                href={`/api/auth/twitch/login?showId=${show.id}`}
                className="button button-outline button-small"
              >
                Connect Twitch <ArrowUpRight size={13} />
              </a>
              <button
                className="button button-primary button-small"
                disabled={chat?.status === "connecting"}
                onClick={connectChat}
              >
                {chat?.status === "connecting" ? (
                  <LoaderCircle size={14} className="spinner" />
                ) : (
                  <Radio size={14} />
                )}
                Listen to chat
              </button>
            </div>
          </div>
        )}
        <div className="studio-grid">
          <section className="world-column" aria-label="The Last Light game">
            <div className="game-stage" ref={stage}>
              <GameViewport
                key={show.id}
                ref={game}
                showHud={false}
                presentation="live"
                onReady={onGameReady}
                onSnapshot={onSnapshot}
                onCheckpoint={onCheckpoint}
                onAuthorityHeartbeat={() => {
                  void renewAuthority.current();
                }}
                onFault={onGameFault}
                paused={
                  paused ||
                  Boolean(preview) ||
                  sampleOpen ||
                  !authority ||
                  Boolean(faultIssue)
                }
              />
              <div className="stage-topline">
                <div>
                  <div className="stage-chapter">
                    <span className="stage-chapter-number">
                      0{currentChapter + 1}
                    </span>
                    {CHAPTERS[currentChapter].toUpperCase()}
                  </div>
                  <div className="stage-objective">
                    {snapshot?.completed
                      ? "The beacon lives. You brought the light."
                      : currentChapter === 0
                        ? "Carry the ember across the broken sky."
                        : currentChapter === 1
                          ? "Wake the machinery. Find your way through."
                          : "Bring the last light to the beacon."}
                  </div>
                </div>
                <div className="stage-badges">
                  <span className="stage-practice">
                    {show.mode === "practice" ? "PRACTICE" : "LIVE WORLD"}
                  </span>
                </div>
              </div>
              {activeCandidate && (
                <div className="stage-law">
                  <Sparkles size={18} />
                  <div>
                    <p className="law-label">A COMMUNITY LAW</p>
                    <p className="law-name">{activeCandidate.program.name}</p>
                    <p className="law-credit">
                      Invented by{" "}
                      {show.proposals.find(
                        (p) => p.id === activeCandidate.proposalId,
                      )?.author || "the host"}
                    </p>
                  </div>
                </div>
              )}
              {paused && !preview && !sampleOpen && (
                <div className="pause-overlay">
                  <Pause size={25} />
                  <h3>A moment of stillness.</h3>
                  <p>Your world is paused. The ember is safe.</p>
                  <button
                    className="button button-primary"
                    disabled={!authority || Boolean(faultIssue)}
                    onClick={() => setPaused(false)}
                  >
                    <Play size={15} />
                    Return to the world
                  </button>
                </div>
              )}
            </div>
            <div className="game-control-strip">
              <div className="keyboard-controls">
                <span className="keyboard-control">
                  <kbd className="key">A</kbd>
                  <kbd className="key">D</kbd>Move
                </span>
                <span className="keyboard-control">
                  <kbd className="key">SPACE</kbd>Jump
                </span>
                <span className="keyboard-control">
                  <kbd className="key">E</kbd>Interact
                </span>
              </div>
              <div className="game-meta">
                <button
                  className="icon-button"
                  title={
                    muted ? "Turn on original interface sounds" : "Mute sounds"
                  }
                  aria-label={muted ? "Turn on sound" : "Mute sound"}
                  onClick={() => void toggleAudio()}
                >
                  {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                <span className="control-divider" />
                <button
                  className="icon-button"
                  title={paused ? "Resume world" : "Pause world"}
                  aria-label={paused ? "Resume world" : "Pause world"}
                  disabled={!authority || Boolean(faultIssue)}
                  onClick={() => setPaused((value) => !value)}
                >
                  {paused ? <Play size={15} /> : <Pause size={15} />}
                </button>
                <button
                  className="icon-button"
                  title="Fullscreen world"
                  aria-label="Fullscreen world"
                  onClick={() => void stage.current?.requestFullscreen()}
                >
                  <Maximize2 size={15} />
                </button>
              </div>
            </div>
            <div className="world-story">
              <div>
                <h2>
                  {snapshot?.completed
                    ? "A little brighter, together."
                    : "Keep the last light alive."}
                </h2>
                <p>
                  {snapshot?.interaction ||
                    "Click the world to take control. Explore the lower path, move the prop, and imagine a better way across."}
                </p>
              </div>
              <div
                className="chapter-map"
                aria-label={`Encounter ${currentChapter + 1} of 3`}
              >
                {CHAPTERS.map((name, index) => (
                  <span key={name} style={{ display: "contents" }}>
                    {index > 0 && <span className="chapter-line" />}
                    <span
                      title={name}
                      className={`chapter-node ${index === currentChapter ? "current" : index < currentChapter ? "done" : ""}`}
                    >
                      {index < currentChapter ? (
                        <Check size={11} />
                      ) : (
                        `0${index + 1}`
                      )}
                    </span>
                  </span>
                ))}
              </div>
            </div>
            <div className="scene-footer">
              <p>
                <ShieldCheck size={13} />
                {checkpointIssue
                  ? "Progress needs saving"
                  : faultIssue
                    ? "Recovery pending"
                    : show.checkpoint
                      ? "Recovery checkpoint saved"
                      : authority
                        ? "World authority connected"
                        : "Connecting world authority"}
              </p>
              <button
                onClick={() => {
                  game.current?.reset();
                  notify("Returned to the current encounter checkpoint.");
                }}
              >
                <RotateCcw size={12} />
                Return to checkpoint
              </button>
            </div>
          </section>
          <aside className="forge-rail" id="forge" aria-label="Community forge">
            <div className="rail-header">
              <div>
                <p className="eyebrow">WHERE WHAT-IFS BECOME REAL</p>
                <h2>The forge</h2>
              </div>
              <span className="round-chip">
                ROUND {String(show.round).padStart(2, "0")}
              </span>
            </div>
            <div className="rail-phase" aria-live="polite">
              <span className={`status-dot ${isWorking ? "brass" : "mint"}`} />
              {isWorking
                ? "An idea is taking shape"
                : candidateReady
                  ? candidate?.approvedAt
                    ? "Approved. Waiting for your moment."
                    : "Your new law is ready"
                  : activeCandidate && !nextRound
                    ? "A new law is in the world"
                    : show.votingOpen
                      ? "Open for a little possibility"
                      : "Shortlist closed"}
              <span className="phase-note">
                {isWorking
                  ? "FORGING"
                  : candidateReady
                    ? "REVIEW"
                    : "YOUR CALL"}
              </span>
            </div>
            {isWorking && latestJob ? (
              <Pipeline
                job={latestJob}
                onCancel={() =>
                  void action("cancel", async () => {
                    const result = await api<HostShowResponse>(
                      `/api/shows/${show.id}/generations/${latestJob.id}/cancel`,
                      {},
                    );
                    setShow(result.show);
                    notify("Generation cancelled. Your world is unchanged.");
                  })
                }
                busy={Boolean(busy)}
              />
            ) : candidateReady && candidate ? (
              <>
                <div className="candidate-card">
                  <div className="candidate-icon">
                    <WandSparkles size={22} />
                  </div>
                  {latestJob?.reused && (
                    <span
                      className="pill pill-brass"
                      style={{ marginBottom: 12 }}
                    >
                      REUSED GENERATION
                    </span>
                  )}
                  <h3>{candidate.program.name}</h3>
                  <p>
                    {ruleDescription(
                      candidate.program.description,
                      candidate.sourceHash,
                    )}
                  </p>
                  <div className="candidate-checks">
                    <span className="candidate-check">
                      <CircleCheck size={13} />
                      {
                        candidate.verification.checks.filter((c) => c.passed)
                          .length
                      }{" "}
                      independent checks passed
                    </span>
                    <span className="candidate-check">
                      <CircleCheck size={13} />
                      {candidate.verification.ticksSimulated.toLocaleString()}{" "}
                      ticks simulated
                    </span>
                    <span className="candidate-check">
                      <ShieldCheck size={13} />
                      {candidate.approvedAt
                        ? "Exact version approved by you"
                        : "Live world waits for your approval"}
                    </span>
                  </div>
                  <div className="candidate-info">
                    <span>VERSION {shortHash(candidate.sourceHash)}</span>
                    <span>
                      {latestJob?.reused
                        ? "PREVIOUSLY GENERATED"
                        : "GENERATED WITH CODEX"}
                    </span>
                  </div>
                </div>
                <div className="rail-action">
                  {candidate.approvedAt ? (
                    <>
                      <button
                        className="button button-primary button-full"
                        disabled={Boolean(busy) || !authority}
                        onClick={() => void activate(candidate)}
                      >
                        {busy === "activate" ? (
                          <LoaderCircle className="spinner" size={15} />
                        ) : (
                          <Sparkles size={15} />
                        )}
                        Activate at a checkpoint
                        <ArrowRight size={15} />
                      </button>
                      <button
                        className="button button-quiet button-full"
                        onClick={() => void openPreview(candidate)}
                      >
                        Visit the preview again
                      </button>
                      <p className="rail-footnote">
                        Land on a platform first. Your current position becomes
                        the recovery checkpoint.
                      </p>
                    </>
                  ) : (
                    <>
                      <button
                        className="button button-primary button-full"
                        disabled={Boolean(busy)}
                        onClick={() => void openPreview(candidate)}
                      >
                        <FlaskConical size={15} />
                        Preview & decide
                        <ArrowRight size={15} />
                      </button>
                      <p className="rail-footnote">
                        Try it before it enters your world.
                      </p>
                    </>
                  )}
                </div>
              </>
            ) : activeCandidate && !nextRound ? (
              <>
                <div className="candidate-card active-card">
                  <div className="active-badge">
                    <span className="status-dot mint" />
                    NOW PART OF YOUR WORLD
                  </div>
                  <blockquote>“{activeCandidate.program.name}”</blockquote>
                  <p className="active-description">
                    {ruleDescription(
                      activeCandidate.program.description,
                      activeCandidate.sourceHash,
                    )}
                  </p>
                  <div className="preview-attribution">
                    <span className="author-chip">
                      <span className="author-avatar">
                        {
                          (show.proposals.find(
                            (p) => p.id === activeCandidate.proposalId,
                          )?.author || "H")[0]
                        }
                      </span>
                      Invented by{" "}
                      {show.proposals.find(
                        (p) => p.id === activeCandidate.proposalId,
                      )?.author || "the host"}
                    </span>
                  </div>
                  <div className="candidate-info">
                    <span>VERSION {shortHash(activeCandidate.sourceHash)}</span>
                    <span>ACTIVE</span>
                  </div>
                </div>
                <div className="rail-action">
                  <button
                    className="button button-primary button-full"
                    onClick={() => {
                      setNextRound(true);
                      setSelectedId(null);
                    }}
                  >
                    Open the next what-if <ArrowRight size={15} />
                  </button>
                  <p className="rail-footnote">
                    Each new law replaces the previous experimental law.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="rail-body">
                  <p className="rail-intro">
                    {show.mode === "practice"
                      ? "Start with a small impossibility. Give the world a rule it has never had."
                      : "Your audience has ideas. Let’s give one of them a place in the world."}
                  </p>
                  <div className="command-block">
                    <span>!forge &lt;your wild idea&gt;</span>
                    <button
                      title="Copy command"
                      aria-label="Copy forge command"
                      onClick={() =>
                        void copy("!forge ", "Forge command copied.")
                      }
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                  <div className="rail-subhead">
                    <span>THE SHORTLIST</span>
                    <span className="count">
                      {
                        show.proposals.filter((p) => p.status !== "hidden")
                          .length
                      }{" "}
                      IDEAS{" "}
                      <button
                        className="intake-toggle"
                        disabled={Boolean(busy)}
                        onClick={() => void toggleIntake()}
                      >
                        {show.votingOpen ? "Close intake" : "Open intake"}
                      </button>
                    </span>
                  </div>
                  {show.proposals.filter((p) => p.status !== "hidden")
                    .length === 0 ? (
                    <div className="empty-forge">
                      <MessageCircle size={24} strokeWidth={1.3} />
                      <h3>The first spark is yours.</h3>
                      <p>
                        {show.mode === "practice"
                          ? "Add a host-authored idea below. We never fill the room with pretend viewers."
                          : "When someone sends !forge in your connected Twitch chat, their idea appears here."}
                      </p>
                    </div>
                  ) : (
                    <div className="proposal-list">
                      {show.proposals
                        .filter((p) => p.status !== "hidden")
                        .slice()
                        .reverse()
                        .map((proposal) => (
                          <ProposalCard
                            key={proposal.id}
                            proposal={proposal}
                            selected={proposal.id === selectedId}
                            onSelect={() => {
                              setSelectedId(proposal.id);
                              tone("select");
                            }}
                            onHide={() => void moderate(proposal, true)}
                            onSupport={
                              show.mode === "practice"
                                ? () =>
                                    void action("vote", async () => {
                                      const result =
                                        await api<HostShowResponse>(
                                          `/api/shows/${show.id}/votes`,
                                          { proposalId: proposal.id },
                                        );
                                      setShow(result.show);
                                    })
                                : undefined
                            }
                          />
                        ))}
                    </div>
                  )}
                  {show.proposals.some((p) => p.status === "hidden") && (
                    <details className="hidden-ideas">
                      <summary>
                        Hidden ideas (
                        {
                          show.proposals.filter((p) => p.status === "hidden")
                            .length
                        }
                        )
                      </summary>
                      {show.proposals
                        .filter((p) => p.status === "hidden")
                        .map((proposal) => (
                          <div key={proposal.id}>
                            <span>{proposal.text}</span>
                            <button
                              disabled={Boolean(busy)}
                              onClick={() => void moderate(proposal, false)}
                            >
                              Restore
                            </button>
                          </div>
                        ))}
                    </details>
                  )}
                  {show.mode === "practice" && (
                    <form className="proposal-form" onSubmit={submitProposal}>
                      <label className="field-label" htmlFor="idea">
                        Your practice idea
                      </label>
                      <textarea
                        id="idea"
                        className="proposal-textarea"
                        placeholder="What if a still prop’s shadow became a bridge?"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        maxLength={280}
                        required
                        minLength={8}
                      />
                      <div className="proposal-form-footer">
                        <span className="char-count">
                          {draft.length}/280 · HOST-AUTHORED
                        </span>
                        <button
                          className="button button-outline button-small"
                          disabled={Boolean(busy) || draft.trim().length < 8}
                          type="submit"
                        >
                          Add idea <ArrowRight size={13} />
                        </button>
                      </div>
                      {!show.proposals.length && (
                        <div className="idea-suggestions">
                          <button
                            className="suggestion-chip"
                            type="button"
                            onClick={() => setDraft(INSPIRATIONS[0])}
                          >
                            A solid shadow
                          </button>
                          <button
                            className="suggestion-chip"
                            type="button"
                            onClick={() => setDraft(INSPIRATIONS[1])}
                          >
                            A prop-made step
                          </button>
                          <button
                            className="suggestion-chip"
                            type="button"
                            onClick={() => setDraft(INSPIRATIONS[2])}
                          >
                            A living glow
                          </button>
                        </div>
                      )}
                    </form>
                  )}
                  {latestJob &&
                    ["failed", "cancelled", "stale", "rejected"].includes(
                      latestJob.status,
                    ) && (
                      <div
                        className="notice"
                        style={{ marginTop: 18, marginBottom: 0 }}
                      >
                        <Info size={14} />
                        <div>{latestJob.message}</div>
                      </div>
                    )}
                  <button
                    className="starter-button"
                    onClick={() => setSampleOpen(true)}
                  >
                    <Play size={12} />
                    See what a little stillness can do
                  </button>
                </div>
                <div className="rail-action">
                  {status?.generation.allowed &&
                  status.generation.configured ? (
                    <>
                      <button
                        className="button button-primary button-full"
                        disabled={!selected || Boolean(busy)}
                        onClick={generate}
                      >
                        <WandSparkles size={15} />
                        Forge the selected idea
                        <ArrowRight size={15} />
                      </button>
                      <p className="rail-footnote">
                        A real Codex job. You review the result before it goes
                        live.
                      </p>
                    </>
                  ) : (
                    <p className="rail-footnote">
                      {status?.generation.quota?.exhausted
                        ? "Today’s fresh-generation allowance is used. Your world stays playable; reuse a verified law below or return after the UTC reset."
                        : status?.generation.allowed
                          ? "Fresh generation is temporarily unavailable. You can still reuse a verified law below."
                          : "Connect a Twitch account to forge fresh ideas with a daily allowance. You can reuse a verified law without a model call."}
                    </p>
                  )}
                  {!status?.generation.allowed &&
                    !status?.generation.quota?.exhausted && (
                      <a
                        className="button button-outline button-full"
                        href={`/api/auth/twitch/login?showId=${show.id}`}
                      >
                        <Radio size={15} /> Connect a Twitch account
                      </a>
                    )}
                  {status?.generation.quota &&
                    !status.generation.quota.exempt && (
                      <p className="rail-footnote">
                        {status.generation.quota.userRemaining} of{" "}
                        {status.generation.quota.perUserLimit} personal runs
                        remain today · {status.generation.quota.globalRemaining}{" "}
                        shared runs remain. Resets at 00:00 UTC.
                      </p>
                    )}
                  <div className="rail-info">
                    <ShieldCheck size={13} />
                    <span>
                      Support helps you choose. It never activates a law.
                      <br />
                      Bounded mechanics. Human approval. One active law.
                    </span>
                  </div>
                </div>
              </>
            )}
            <div className="rail-fallback">
              <button
                className="button button-outline button-full"
                disabled={Boolean(busy) || isWorking || Boolean(faultIssue)}
                onClick={() => void loadReused()}
              >
                {busy === "sample" ? (
                  <LoaderCircle size={15} className="spinner" />
                ) : (
                  <FlaskConical size={15} />
                )}
                Use a previously generated law
              </button>
              <p className="rail-footnote">
                No AI call. A separate reused proposal keeps its original
                provenance. Preview and approval are still required.
              </p>
            </div>
            <div className="rail-recovery">
              <span>
                <LockKeyhole
                  size={10}
                  style={{ verticalAlign: "middle", marginRight: 5 }}
                />
                You hold the final say.
              </span>
              <button
                disabled={!show.previousCheckpoint || Boolean(busy)}
                onClick={() => setRecoveryOpen(true)}
              >
                <RotateCcw size={11} />
                Restore previous law
              </button>
            </div>
          </aside>
        </div>
      </main>
      <CandidatePreview
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        candidate={preview}
        proposal={show.proposals.find((p) => p.id === preview?.proposalId)}
        baseline={previewBaseline}
        onApprove={approve}
        onReject={reject}
        onRevise={revise}
        busy={Boolean(busy)}
      />
      <SamplePreview
        open={sampleOpen}
        onClose={() => setSampleOpen(false)}
        program={practiceProgram}
      />
      <EvidencePanel
        open={evidenceOpen}
        onClose={() => setEvidenceOpen(false)}
        show={show}
      />
      <ShowManager
        open={showManagerOpen}
        onClose={() => setShowManagerOpen(false)}
        currentId={show.id}
        onResume={resumeShow}
        onCreate={async (mode) => {
          await createShow(mode);
        }}
      />
      <Modal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title="Give your world a window."
        eyebrow="SHOW OUTPUTS"
      >
        <div className="share-section">
          <h3>The broadcast projector</h3>
          <p>
            Open the clean game view in a new window in this browser. In OBS,
            use Window Capture for that window. Keep this studio open; it
            remains the game authority.
          </p>
          <div className="share-row">
            <input
              className="dialog-field"
              readOnly
              value={`${publicOrigin}/broadcast?show=${show.id}`}
              aria-label="Broadcast projector URL"
            />
            <a
              className="button button-primary button-small"
              href={`/broadcast?show=${show.id}`}
              target="_blank"
              rel="noreferrer"
            >
              Open <ExternalLink size={13} />
            </a>
          </div>
        </div>
        <div className="share-section">
          <h3>The community board</h3>
          <p>
            A public, read-only shortlist for your audience. People submit and
            support through Twitch chat.
          </p>
          <div className="share-row">
            <input
              className="dialog-field"
              readOnly
              value={`${publicOrigin}/community/${show.id}`}
              aria-label="Community board URL"
            />
            <button
              className="button button-outline button-small"
              onClick={() => void copy(`${publicOrigin}/community/${show.id}`)}
            >
              <Copy size={13} />
              Copy
            </button>
            <a
              className="button button-outline button-small"
              href={`/community/${show.id}`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={13} />
              <span className="sr-only">Open community board</span>
            </a>
          </div>
        </div>
        <div className="rail-info">
          <Info size={14} />
          <span>
            The projector shares frames within this browser profile. A separate
            OBS Browser Source cannot receive those frames. Window Capture is
            the supported setup.
          </span>
        </div>
        <div className="modal-actions">
          <button
            className="button button-primary"
            onClick={() => setShareOpen(false)}
          >
            Back to the show
          </button>
        </div>
      </Modal>
      <Modal
        open={recoveryOpen}
        onClose={() => setRecoveryOpen(false)}
        title="Bring back the previous world."
        eyebrow="RECOVERY CHECKPOINT"
      >
        <p className="modal-copy">
          This restores the law and world position saved just before the last
          activation. Movement and progress since that moment will reset. The
          idea, source, and contributor credit remain in the evidence history.
        </p>
        <div className="modal-actions">
          <button
            className="button button-quiet"
            onClick={() => setRecoveryOpen(false)}
          >
            Keep playing
          </button>
          <button
            className="button button-primary"
            disabled={Boolean(busy)}
            onClick={() => void rollback()}
          >
            <RotateCcw size={15} />
            Restore checkpoint
          </button>
        </div>
      </Modal>
      {toast && (
        <div className="toast" role="status">
          <CircleCheck size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}

function Notice({
  message,
  onClose,
  action,
}: {
  message: string;
  onClose: () => void;
  action?: React.ReactNode;
}) {
  return (
    <div className="notice notice-error" role="alert">
      <Info size={15} />
      <div>{message}</div>
      {action}
      <button onClick={onClose} aria-label="Dismiss notice">
        <X size={15} />
      </button>
    </div>
  );
}

function ProposalCard({
  proposal,
  selected,
  onSelect,
  onSupport,
  onHide,
}: {
  proposal: Proposal;
  selected: boolean;
  onSelect: () => void;
  onSupport?: () => void;
  onHide: () => void;
}) {
  return (
    <article className={`proposal-card${selected ? " selected" : ""}`}>
      <button
        className="proposal-select"
        aria-pressed={selected}
        aria-label={`Select ${proposal.id}: ${proposal.text}`}
        onClick={onSelect}
      >
        <span className="proposal-card-head">
          <span className="proposal-id">{proposal.id}</span>
          <span className="proposal-origin">
            {proposal.origin === "practice" ? "PRACTICE IDEA" : "FROM TWITCH"}
          </span>
          <span className="proposal-selected-dot" />
        </span>
        <span className="proposal-copy">{proposal.text}</span>
      </button>
      <div className="proposal-card-foot">
        <span className="author-chip">
          <span className="author-avatar">
            {proposal.author[0]?.toUpperCase()}
          </span>
          {proposal.author}
        </span>
        <div className="button-group">
          <button
            className="icon-button proposal-hide"
            title="Hide idea from shortlist"
            aria-label={`Hide proposal ${proposal.id}`}
            onClick={onHide}
          >
            <EyeOff size={13} />
          </button>
          {onSupport ? (
            <button
              className="support-button"
              aria-label={`Back proposal ${proposal.id}`}
              onClick={onSupport}
            >
              <ChevronUp size={13} />
              {proposal.votes}
            </button>
          ) : (
            <span className="support-button">
              <Heart size={11} />
              {proposal.votes}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function Pipeline({
  job,
  onCancel,
  busy,
}: {
  job: GenerationJob;
  onCancel: () => void;
  busy: boolean;
}) {
  const steps = [
    "Preparing the forge",
    "Writing a new law",
    "Checking & simulating the world",
  ];
  const index =
    job.status === "verifying" ? 2 : job.status === "generating" ? 1 : 0;
  return (
    <div className="pipeline">
      <div className="pipeline-art">
        <ForgeMark size={37} />
      </div>
      <h3>
        A what-if is
        <br />
        taking shape.
      </h3>
      <p>{job.message}</p>
      <div className="pipeline-steps">
        {steps.map((step, i) => (
          <div
            key={step}
            className={`pipeline-step ${i < index ? "done" : i === index ? "current" : ""}`}
          >
            <span className="pipeline-step-count">
              {i < index ? (
                <Check size={12} />
              ) : i === index ? (
                <LoaderCircle size={12} className="spinner" />
              ) : (
                `0${i + 1}`
              )}
            </span>
            <span>{step}</span>
          </div>
        ))}
      </div>
      <p className="pipeline-duration">
        {elapsed(job.createdAt)} ELAPSED · ATTEMPT {Math.max(1, job.attempt)}
      </p>
      <p style={{ fontSize: 9, marginTop: 17 }}>
        Keep playing while Codex works. This stage may take a minute or more.
      </p>
      <button
        className="button button-quiet button-full"
        onClick={onCancel}
        disabled={busy}
        style={{ marginTop: 15 }}
      >
        Cancel generation
      </button>
    </div>
  );
}
