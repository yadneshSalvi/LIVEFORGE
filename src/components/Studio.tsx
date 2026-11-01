"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  FlaskConical,
  FolderOpen,
  Heart,
  Info,
  LoaderCircle,
  LockKeyhole,
  BookOpen,
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
import { ForgeMark } from "./Brand";
import { GameViewport, type GameViewportHandle } from "./GameViewport";
import { CandidatePreview, SamplePreview } from "./CandidatePreview";
import { EvidencePanel } from "./EvidencePanel";
import { Modal } from "./Modal";
import { StatusChip } from "./StatusChip";
import { ShowManager } from "./ShowManager";
import { LawLibrary } from "./LawLibrary";
import { ModerationPanel } from "./ModerationPanel";
import { AdaptationComposer } from "./AdaptationComposer";
import {
  keepNewerReviewState,
  type AlternativeRequest,
} from "@/lib/adaptation-review";
import { api, ApiError, errorMessage } from "@/lib/api";
import {
  adaptationLabel,
  isSampleLaw,
  publicRuleAncestry,
  ruleCredit,
  ruleDescription,
} from "@/lib/rule-copy";
import { CAPABILITY_HINT } from "@/lib/capabilities";
import { StudioViewFence } from "@/lib/view-fence";
import {
  retireFaultedLaw,
  continueWithoutLaws,
  type RuntimeRecoveryTarget,
} from "@/lib/runtime-recovery";
import { TwitchConnector } from "@/lib/twitch-client";
import { compileRuleSource, PRACTICE_RULE_SOURCE } from "@/game/rules";
import { ENGINE_VERSION } from "@/game/contracts";
import type {
  GameCheckpoint,
  GameSnapshot,
  WorkerRuntimeFaultContext,
} from "@/game/contracts";
import type {
  AuthorityLease,
  ActivationMode,
  Candidate,
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
  twitch: { configured: boolean; chatRepliesAuthorized?: boolean };
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
  const [recoveryConflict, setRecoveryConflict] = useState(false);
  const [preview, setPreview] = useState<Candidate | null>(null);
  const [previewBaseline, setPreviewBaseline] = useState<GameCheckpoint | null>(
    null,
  );
  const [sampleOpen, setSampleOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceCandidate, setEvidenceCandidate] = useState<Candidate | null>(
    null,
  );
  const [shareOpen, setShareOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [showManagerOpen, setShowManagerOpen] = useState(false);
  const [nextRound, setNextRound] = useState(false);
  const [activationMode, setActivationMode] =
    useState<ActivationMode>("append");
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [moderationOpen, setModerationOpen] = useState(false);
  const [chatState, setChatState] = useState<{
    status: string;
    message: string;
  } | null>(null);
  const game = useRef<GameViewportHandle>(null);
  const forgeAction = useRef<HTMLDivElement>(null);
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
  const faultConflict = useRef(false);
  const currentShow = useRef<ShowState | null>(null);
  const viewFence = useRef(new StudioViewFence());
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
    const ticket = viewFence.current.ticket(currentShow.current?.id);
    if (!ticket) return currentShow.current;
    try {
      const result = await api<HostShowResponse>("/api/shows/current");
      if (
        !viewFence.current.accepts(
          ticket,
          currentShow.current?.id,
          result.show.id,
        )
      )
        return currentShow.current;
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
      current.engineUpgradeRequired ||
      current.engineVersion !== ENGINE_VERSION ||
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
      const ticket = viewFence.current.ticket(showId);
      if (!ticket || currentShow.current?.id !== showId) return;
      renewing = true;
      try {
        const result = await api<HostShowResponse>(
          `/api/shows/${showId}/lease`,
          { clientId: clientId.current },
          AbortSignal.timeout(10000),
        );
        if (
          alive &&
          viewFence.current.accepts(
            ticket,
            currentShow.current?.id,
            result.show.id,
          )
        ) {
          acquired = result.show.lease;
          lease.current = result.show.lease;
          setAuthority(result.show.lease);
          setAuthorityIssue(null);
          if (lostAuthority.current) {
            if (
              result.show.checkpoint &&
              !result.show.engineUpgradeRequired &&
              !pendingFault.current
            )
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
        if (
          alive &&
          viewFence.current.accepts(ticket, currentShow.current?.id, showId)
        ) {
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
      const held =
        currentShow.current?.id === showId
          ? lease.current || acquired
          : acquired;
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
    const proposal = current?.proposals.find(
      (proposal) => proposal.id === active?.proposalId,
    );
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
            author: proposal?.author,
            origin: proposal?.origin,
            ancestry: publicRuleAncestry(proposal?.ancestry),
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
    if (
      current?.engineUpgradeRequired ||
      current?.engineVersion !== ENGINE_VERSION
    ) {
      game.current?.pause(true);
      return;
    }
    if (current?.checkpoint) game.current?.restore(current.checkpoint);
    else {
      const active = current?.candidates.find(
        (candidate) => candidate.id === current.activeCandidateId,
      );
      if (active)
        game.current?.activate(
          active.composition?.program || active.program,
          active.composition?.artifactHash || active.sourceHash,
        );
    }
    game.current?.pause(paused || !lease.current);
  };

  const onCheckpoint = (checkpoint: GameCheckpoint) => {
    void saveCheckpoint(checkpoint);
  };

  const recoverRuntimeFault = async (retireAll = false) => {
    const pending = pendingFault.current;
    if (
      !pending ||
      faultInFlight.current ||
      (faultConflict.current && !retireAll)
    )
      return;
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
      const result = await (retireAll ? continueWithoutLaws : retireFaultedLaw)(
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
      faultConflict.current = false;
      setRecoveryConflict(false);
      setFaultIssue(null);
      setCheckpointIssue(null);
      setNextRound(true);
      notify(
        result.show.activeCandidateId
          ? "Fault recovery saved. The current approved world is restored; resume when ready."
          : "All laws retired. Your saved world is safe; resume when ready.",
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        faultConflict.current = true;
        setRecoveryConflict(true);
      }
      setFaultIssue(
        faultConflict.current
          ? `Recovery paused because the saved world changed. ${errorMessage(error)} Continue without laws to save a safe world.`
          : `The law stopped safely, but server recovery is not complete. ${errorMessage(error)} Retry before resuming.`,
      );
    } finally {
      faultInFlight.current = false;
      setRecoveringFault(false);
    }
  };

  const onGameFault = (message: string, fault?: WorkerRuntimeFaultContext) => {
    game.current?.pause(true);
    setPaused(true);
    if (pendingFault.current) return;
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
    faultConflict.current = false;
    setRecoveryConflict(false);
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
    if (currentBusy.current) return;
    if (pendingFault.current && name !== "takeover") {
      setFaultIssue(
        "Finish saving fault recovery before changing the show. Retry recovery or take control here.",
      );
      return;
    }
    // React state updates on the next render; fence rapid clicks synchronously.
    currentBusy.current = name;
    setBusy(name);
    setError(null);
    try {
      await callback();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      currentBusy.current = null;
      setBusy(null);
      if (["generate", "revise"].includes(name))
        void api<ServiceStatus>("/api/status")
          .then(setStatus)
          .catch(() => undefined);
    }
  };

  const createShow = (mode: ShowMode) =>
    action("create", async () => {
      const generation = viewFence.current.begin();
      try {
        twitch.current?.stop();
        twitch.current = null;
        setChatState(null);
        const result = await api<HostShowResponse>("/api/shows", { mode });
        currentShow.current = result.show;
        setShow(result.show);
        lease.current = null;
        lostAuthority.current = false;
        setAuthority(null);
        setPaused(false);
        setSelectedId(null);
        setSnapshot(null);
        setAuthorityIssue(null);
        setCheckpointIssue(null);
        setFaultIssue(null);
        pendingFault.current = null;
        faultConflict.current = false;
        setRecoveryConflict(false);
        setNextRound(false);
        setActivationMode("append");
        setStatus(await api<ServiceStatus>("/api/status"));
        window.history.replaceState(null, "", "/studio");
        window.scrollTo({ top: 0, behavior: "instant" });
      } finally {
        viewFence.current.finish(generation);
        void renewAuthority.current();
      }
    });

  const resumeShow = async (resumed: ShowState) => {
    const generation = viewFence.current.begin();
    try {
      twitch.current?.stop();
      twitch.current = null;
      setChatState(null);
      currentShow.current = resumed;
      setShow(resumed);
      lease.current = null;
      lostAuthority.current = false;
      setAuthority(null);
      setSnapshot(null);
      setAuthorityIssue(null);
      setCheckpointIssue(null);
      setFaultIssue(null);
      pendingFault.current = null;
      faultConflict.current = false;
      setRecoveryConflict(false);
      setSelectedId(null);
      setNextRound(false);
      setActivationMode("append");
      setPreview(null);
      setPaused(false);
      setError(null);
      setStatus(await api<ServiceStatus>("/api/status"));
    } finally {
      viewFence.current.finish(generation);
      void renewAuthority.current();
    }
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
        { proposalId: selectedId, mode: activationMode },
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
          compositionHash: preview.composition?.compositionHash,
          contextHash: preview.composition?.contextHash,
          artifactHash: preview.composition?.artifactHash,
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
            compositionHash: candidate.composition?.compositionHash,
            contextHash: candidate.composition?.contextHash,
            artifactHash: candidate.composition?.artifactHash,
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
      if (result.show.checkpoint && !result.show.engineUpgradeRequired)
        game.current?.restore(result.show.checkpoint);
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
        { mode: activationMode },
      );
      setShow(result.show);
      setNextRound(false);
      notify("Sample law loaded");
    });
  const saveLaw = (candidate: Candidate) =>
    action("save-law", async () => {
      if (!show) return;
      const result = await api<HostShowResponse>(
        `/api/shows/${show.id}/library/save`,
        { candidateId: candidate.id },
      );
      setShow(result.show);
      notify(
        "Exact source saved to your law library with its original credit.",
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
  const upgradeWorld = () =>
    action("upgrade", async () => {
      if (!show || !authority)
        throw new Error(
          "Take control of this studio before upgrading its saved world.",
        );
      const result = await api<HostShowResponse>(
        `/api/shows/${show.id}/upgrade`,
        {
          clientId: clientId.current,
          epoch: authority.epoch,
          expectedRevision: show.revision,
          targetEngineVersion: ENGINE_VERSION,
        },
      );
      currentShow.current = result.show;
      setShow(result.show);
      if (result.show.checkpoint) game.current?.restore(result.show.checkpoint);
      setPaused(true);
      setUpgradeOpen(false);
      setNextRound(true);
      setPreview(null);
      setSelectedId(null);
      setCheckpointIssue(null);
      setError(null);
      notify(
        "Expanded world ready. Your earlier save and law history are preserved.",
      );
    });

  const createAlternative = async (request: AlternativeRequest) => {
    const ticket = viewFence.current.ticket(show?.id);
    if (!show || request.showId !== show.id || !ticket)
      throw new Error(
        "The studio changed. Review the alternative in the current show.",
      );
    if (busy) throw new Error("Wait for the current studio action to finish.");
    if (pendingFault.current)
      throw new Error(
        "Finish saving fault recovery before creating an alternative.",
      );
    setBusy("adapt");
    setError(null);
    try {
      const adapted = await api<HostShowResponse>(
        `/api/shows/${show.id}/generations/${request.jobId}/adapt`,
        request.body,
        undefined,
        { idempotencyKey: request.idempotencyKey },
      );
      if (
        !viewFence.current.accepts(
          ticket,
          currentShow.current?.id,
          adapted.show.id,
        )
      )
        return;
      const reviewed = keepNewerReviewState(currentShow.current, adapted.show);
      currentShow.current = reviewed;
      setShow((current) => keepNewerReviewState(current, reviewed));
      if (reviewed !== adapted.show) {
        notify(
          "Your alternative was saved. The world changed; review the current board before forging.",
        );
        return;
      }
      const proposalId = adapted.show.jobs.find(
        (job) => job.id === request.jobId,
      )?.adaptationProposalId;
      if (!proposalId)
        throw new Error(
          "The adapted proposal could not be located. Your original idea is preserved.",
        );
      setSelectedId(proposalId);
      setNextRound(true);
      notify(
        `Reviewed alternative ${proposalId} is selected. Forge it when you are ready.`,
      );
    } catch (cause) {
      if (
        !viewFence.current.accepts(
          ticket,
          currentShow.current?.id,
          request.showId,
        )
      )
        return;
      if (
        cause instanceof ApiError &&
        ["stale_revision", "stale_job"].includes(cause.code || "")
      )
        void refresh().catch(() => undefined);
      throw cause;
    } finally {
      if (
        viewFence.current.accepts(
          ticket,
          currentShow.current?.id,
          request.showId,
        )
      )
        setBusy(null);
    }
  };
  const revise = async (revision: string) => {
    if (!show || !preview || currentBusy.current) return;
    if (pendingFault.current)
      throw new Error("Finish saving fault recovery before revising a law.");
    currentBusy.current = "revise";
    setBusy("revise");
    try {
      const result = await api<HostShowResponse>(
        `/api/shows/${show.id}/generate`,
        {
          proposalId: preview.proposalId,
          priorCandidateId: preview.id,
          revision,
          mode: preview.composition?.mode || activationMode,
        },
      );
      setShow(result.show);
      setPreview(null);
      setNextRound(false);
      notify(
        "A fresh revision is being generated. Original credit is preserved.",
      );
    } finally {
      currentBusy.current = null;
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
    (proposal) =>
      proposal.id === selectedId &&
      !["hidden", "rejected"].includes(proposal.status),
  );
  const isWorking = Boolean(latestJob && WORKING.has(latestJob.status));
  const needsUpgrade = Boolean(
    show &&
    (show.engineUpgradeRequired || show.engineVersion !== ENGINE_VERSION),
  );
  const activeCandidates = (show?.activeCandidateIds || [])
    .map((id) => show?.candidates.find((entry) => entry.id === id))
    .filter((entry): entry is Candidate => Boolean(entry));
  const stackFull = activationMode === "append" && activeCandidates.length >= 3;
  const candidateReady =
    !needsUpgrade &&
    candidate &&
    !candidate.activatedAt &&
    latestJob?.status === "ready" &&
    candidate.composition?.engineVersion === ENGINE_VERSION;
  // Mirrors the rail branches below for the visually hidden live region.
  const railPhase =
    isWorking && latestJob
      ? `Forging ${latestJob.proposalId}`
      : candidateReady && candidate
        ? candidate.approvedAt
          ? "Approved — ready to activate"
          : "Ready for review"
        : activeCandidate && !nextRound && !needsUpgrade
          ? "Law active"
          : show?.votingOpen
            ? "Intake open"
            : "Intake closed";
  const forgeBlockedReason = stackFull
    ? "Choose Replace to change a full stack"
    : !status?.generation.allowed
      ? "Connect Twitch or check your daily allowance"
      : undefined;
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
            <h1>Start a show</h1>
          </div>
          {error && <Notice message={error} onClose={() => setError(null)} />}
          <div className="setup-grid">
            <div className="setup-scene">
              <GameViewport presentation="world" showHud={false} />
              <div className="setup-scene-copy">
                <h2>The Last Light</h2>
              </div>
            </div>
            <div className="setup-options">
              <div className="setup-option">
                <h3>
                  <Radio size={20} />
                  Twitch show
                </h3>
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
                  Start Twitch show <ArrowRight size={15} />
                </button>
              </div>
              <div className="setup-option practice">
                <h3>
                  <FlaskConical size={20} />
                  Practice
                </h3>
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
      <AppHeader />
      <main className="studio-main">
        <div className="studio-heading">
          <StudioTitle mode={show.mode} />
          <div className="button-group">
            <button
              className="icon-button"
              title="Library"
              aria-label="Library"
              disabled={Boolean(busy) || recoveringFault}
              onClick={() => setLibraryOpen(true)}
            >
              <BookOpen size={18} />
            </button>
            <button
              className="icon-button"
              title="Shows"
              aria-label="Shows"
              disabled={Boolean(busy) || recoveringFault || Boolean(faultIssue)}
              onClick={() => setShowManagerOpen(true)}
            >
              <FolderOpen size={18} />
            </button>
            <button
              className="icon-button"
              title="Evidence"
              aria-label="Evidence"
              onClick={() => {
                setEvidenceCandidate(null);
                setEvidenceOpen(true);
              }}
            >
              <Code2 size={18} />
            </button>
            <button
              className="icon-button"
              title="Outputs"
              aria-label="Outputs"
              onClick={() => setShareOpen(true)}
            >
              <ExternalLink size={18} />
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
        {needsUpgrade && (
          <div className="notice recovery-notice" role="status">
            <Sparkles size={22} />
            <div>
              <strong>Update this saved world to continue.</strong>
            </div>
            <button
              className="button button-outline button-small"
              disabled={Boolean(busy) || !authority}
              onClick={() => setUpgradeOpen(true)}
            >
              Review upgrade
            </button>
          </div>
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
              onClick={() => void recoverRuntimeFault(recoveryConflict)}
            >
              {recoveringFault
                ? "Saving recovery…"
                : recoveryConflict
                  ? "Continue without laws"
                  : "Retry recovery"}
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
                <StatusChip variant="warm">
                  {chat?.status === "connecting"
                    ? "Connecting…"
                    : "Chat disconnected"}
                </StatusChip>
                {chat &&
                  ["error", "revoked", "reconnecting"].includes(
                    chat.status,
                  ) && <p role="alert">{chat.message}</p>}
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
                  showManagerOpen ||
                  libraryOpen ||
                  moderationOpen ||
                  upgradeOpen ||
                  needsUpgrade ||
                  !authority ||
                  Boolean(faultIssue)
                }
              />
              <div className="stage-topline">
                <div>
                  <div className="stage-chapter">
                    {CHAPTERS[currentChapter]}
                  </div>
                  <div className="stage-objective">
                    {snapshot?.completed
                      ? "The beacon lives. You brought the light."
                      : currentChapter === 0
                        ? "Carry the ember to the Astral Hearth."
                        : currentChapter === 1
                          ? "Wake the machinery. Find your way through."
                          : "Bring the last light to the beacon."}
                  </div>
                </div>
              </div>
              {paused && !preview && !sampleOpen && (
                <div className="pause-overlay">
                  <Pause size={25} />
                  <h3>Paused</h3>
                  <button
                    className="button button-primary"
                    disabled={!authority || Boolean(faultIssue) || needsUpgrade}
                    onClick={() => setPaused(false)}
                  >
                    <Play size={15} />
                    Resume
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
                <span className="keyboard-control">
                  <kbd className="key">Q</kbd>Ember
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
                  disabled={!authority || Boolean(faultIssue) || needsUpgrade}
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
            <div className="scene-footer">
              <span
                className={`status-dot ${checkpointIssue || faultIssue || !authority ? "brass" : "mint"}`}
                role="img"
                aria-label={
                  checkpointIssue
                    ? "Progress needs saving"
                    : faultIssue
                      ? "Recovery pending"
                      : authority
                        ? "World connected"
                        : "Connecting world"
                }
                title={
                  checkpointIssue
                    ? "Progress needs saving"
                    : faultIssue
                      ? "Recovery pending"
                      : show.checkpoint
                        ? "Checkpoint saved"
                        : authority
                          ? "World connected"
                          : "Connecting world"
                }
              />
              <button
                disabled={needsUpgrade || Boolean(faultIssue) || !authority}
                onClick={() => {
                  game.current?.reset();
                  notify("Returned to the current encounter checkpoint.");
                }}
              >
                <RotateCcw size={12} />
                Return to checkpoint
              </button>
            </div>
            {activeCandidates.length > 0 && !needsUpgrade && (
              <div className="active-law-stack">
                <h3>Active laws</h3>
                <ol>
                  {activeCandidates.map((entry) => (
                    <li key={entry.id}>
                      <Sparkles size={14} />
                      <span>{entry.program.name}</span>
                      <button
                        className="button button-quiet button-small"
                        disabled={Boolean(busy)}
                        onClick={() => void saveLaw(entry)}
                        aria-label={`Save ${entry.program.name} to your law library`}
                      >
                        Save
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>
          <aside className="forge-rail" id="forge" aria-label="Community forge">
            <div className="rail-header">
              <h2>The forge</h2>
              <button
                className="icon-button"
                title="Moderation & chat settings"
                aria-label="Moderation & chat settings"
                disabled={Boolean(busy) || recoveringFault}
                onClick={() => setModerationOpen(true)}
              >
                <ShieldCheck size={18} />
              </button>
            </div>
            <div className="sr-only" aria-live="polite" aria-atomic="true">
              {railPhase}
            </div>
            <div className="rail-intake">
              <StatusChip variant={show.votingOpen ? "good" : "neutral"}>
                {show.votingOpen ? "Intake open" : "Intake closed"}
              </StatusChip>
              <button
                className="button button-quiet button-small"
                disabled={Boolean(busy)}
                onClick={() => void toggleIntake()}
              >
                {show.votingOpen ? "Close intake" : "Open intake"}
              </button>
            </div>
            <div className="law-plan">
              <fieldset
                className="law-mode"
                disabled={
                  Boolean(busy) ||
                  isWorking ||
                  Boolean(candidateReady) ||
                  needsUpgrade
                }
              >
                <legend className="sr-only">Plan the next law</legend>
                <label>
                  <input
                    type="radio"
                    name="law-mode"
                    value="append"
                    checked={activationMode === "append"}
                    onChange={() => setActivationMode("append")}
                  />
                  <span>Add</span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="law-mode"
                    value="replace"
                    checked={activationMode === "replace"}
                    onChange={() => setActivationMode("replace")}
                  />
                  <span>Replace</span>
                </label>
              </fieldset>
              <StatusChip>{activeCandidates.length}/3</StatusChip>
            </div>
            {isWorking && latestJob ? (
              <Pipeline
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
                  <h3>{candidate.program.name}</h3>
                  <p>
                    {ruleDescription(
                      candidate.program.description,
                      candidate.sourceHash,
                    )}
                  </p>
                  <LawCardStatus
                    reused={latestJob?.reused}
                    proposal={show.proposals.find(
                      (p) => p.id === candidate.proposalId,
                    )}
                    onVerified={() => {
                      setEvidenceCandidate(candidate);
                      setEvidenceOpen(true);
                    }}
                  />
                  {candidate.approvedAt && (
                    <button
                      className="button button-outline button-small"
                      style={{ marginTop: 16 }}
                      disabled={Boolean(busy)}
                      onClick={() => void saveLaw(candidate)}
                    >
                      <BookOpen size={13} /> Save law
                    </button>
                  )}
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
                        Activate
                        <ArrowRight size={15} />
                      </button>
                      <button
                        className="button button-quiet button-full"
                        onClick={() => void openPreview(candidate)}
                      >
                        Preview
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="button button-primary button-full"
                        disabled={Boolean(busy)}
                        onClick={() => void openPreview(candidate)}
                      >
                        <FlaskConical size={15} />
                        Preview
                        <ArrowRight size={15} />
                      </button>
                    </>
                  )}
                </div>
              </>
            ) : activeCandidate && !nextRound && !needsUpgrade ? (
              <>
                <div className="candidate-card active-card">
                  <h3>{activeCandidate.program.name}</h3>
                  <p className="active-description">
                    {ruleDescription(
                      activeCandidate.program.description,
                      activeCandidate.sourceHash,
                    )}
                  </p>
                  {ruleCredit(
                    show.proposals.find(
                      (p) => p.id === activeCandidate.proposalId,
                    ),
                  ) && (
                    <p className="law-credit">
                      {ruleCredit(
                        show.proposals.find(
                          (p) => p.id === activeCandidate.proposalId,
                        ),
                      )}
                    </p>
                  )}
                  <LawCardStatus
                    proposal={show.proposals.find(
                      (p) => p.id === activeCandidate.proposalId,
                    )}
                    onVerified={() => {
                      setEvidenceCandidate(activeCandidate);
                      setEvidenceOpen(true);
                    }}
                  />
                </div>
                <div className="rail-action">
                  <button
                    className="button button-primary button-full"
                    onClick={() => {
                      setNextRound(true);
                      setSelectedId(null);
                    }}
                  >
                    Next idea <ArrowRight size={15} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="rail-body">
                  <div className="command-block">
                    <span>!forge &lt;idea&gt;</span>
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
                  {show.proposals.filter(
                    (p) => !["hidden", "rejected"].includes(p.status),
                  ).length === 0 ? (
                    <div className="empty-forge">
                      <MessageCircle size={24} strokeWidth={1.3} />
                      <p>No ideas yet</p>
                    </div>
                  ) : (
                    <div className="proposal-list">
                      {show.proposals
                        .filter(
                          (p) => !["hidden", "rejected"].includes(p.status),
                        )
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
                  {show.proposals.some((p) =>
                    ["hidden", "rejected"].includes(p.status),
                  ) && (
                    <details className="hidden-ideas">
                      <summary>
                        Moderated ideas (
                        {
                          show.proposals.filter((p) =>
                            ["hidden", "rejected"].includes(p.status),
                          ).length
                        }
                        )
                      </summary>
                      {show.proposals
                        .filter((p) =>
                          ["hidden", "rejected"].includes(p.status),
                        )
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
                        Idea
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
                        {draft.length > 0 && (
                          <span className="char-count">{draft.length}/280</span>
                        )}
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
                  {latestJob?.status === "failed" && (
                    <AdaptationComposer
                      key={`${show.id}:${latestJob.id}`}
                      showId={show.id}
                      job={latestJob}
                      revision={show.revision}
                      original={show.proposals.find(
                        (item) => item.id === latestJob.proposalId,
                      )}
                      accepted={show.proposals.find(
                        (item) => item.id === latestJob.adaptationProposalId,
                      )}
                      selected={selectedId === latestJob.adaptationProposalId}
                      busy={Boolean(busy)}
                      disabledReason={
                        needsUpgrade ||
                        latestJob.engineVersion !== ENGINE_VERSION
                          ? "This failed run belongs to an older world. Start a current-engine idea after upgrading."
                          : !show.votingOpen
                            ? "Open idea intake before creating a reviewed alternative."
                            : recoveringFault
                              ? "Finish saving fault recovery before changing ideas."
                              : undefined
                      }
                      onCreate={createAlternative}
                      onSelect={() => {
                        if (!latestJob.adaptationProposalId) return;
                        setSelectedId(latestJob.adaptationProposalId);
                        setNextRound(true);
                        forgeAction.current?.scrollIntoView({
                          block: "nearest",
                          behavior: "smooth",
                        });
                        forgeAction.current?.focus({ preventScroll: true });
                      }}
                    />
                  )}
                  <details className="capability-guide">
                    <summary>What can this world learn?</summary>
                    <div className="capability-chips">
                      {CAPABILITY_HINT.replace(/^Try /, "")
                        .replace(/\.$/, "")
                        .replace(/,? and | or /g, ", ")
                        .split(", ")
                        .map((hint) => (
                          <StatusChip key={hint}>{hint}</StatusChip>
                        ))}
                    </div>
                    <button
                      className="button button-quiet button-small"
                      onClick={() => setSampleOpen(true)}
                    >
                      <Play size={14} /> Try sample world
                    </button>
                  </details>
                </div>
                <div
                  className="rail-action"
                  ref={forgeAction}
                  tabIndex={-1}
                  role="group"
                  aria-label="Forge the selected idea"
                >
                  <button
                    className="button button-primary button-full"
                    disabled={
                      !selected ||
                      Boolean(busy) ||
                      needsUpgrade ||
                      stackFull ||
                      !status?.generation.allowed ||
                      !status.generation.configured
                    }
                    title={forgeBlockedReason}
                    aria-describedby={
                      forgeBlockedReason ? "forge-blocked-reason" : undefined
                    }
                    onClick={generate}
                  >
                    <WandSparkles size={15} /> Forge selected idea{" "}
                    <ArrowRight size={15} />
                  </button>
                  {forgeBlockedReason && (
                    <span id="forge-blocked-reason" className="sr-only">
                      {forgeBlockedReason}
                    </span>
                  )}
                  <div className="forge-access">
                    {!status?.generation.allowed &&
                      !status?.generation.quota?.exhausted && (
                        <a
                          className="button button-quiet button-small"
                          href={`/api/auth/twitch/login?showId=${show.id}`}
                        >
                          <Radio size={15} /> Connect Twitch
                        </a>
                      )}
                    {status?.generation.quota &&
                      !status.generation.quota.exempt && (
                        <StatusChip
                          variant={
                            status.generation.quota.exhausted
                              ? "warm"
                              : "neutral"
                          }
                        >
                          {Math.min(
                            status.generation.quota.userRemaining ?? Infinity,
                            status.generation.quota.globalRemaining ?? Infinity,
                          )}{" "}
                          left today
                        </StatusChip>
                      )}
                  </div>
                </div>
              </>
            )}
            <div className="rail-fallback">
              <button
                className="button button-outline button-full"
                disabled={
                  Boolean(busy) ||
                  isWorking ||
                  Boolean(faultIssue) ||
                  needsUpgrade ||
                  stackFull
                }
                onClick={() => void loadReused()}
              >
                {busy === "sample" ? (
                  <LoaderCircle size={15} className="spinner" />
                ) : (
                  <FlaskConical size={15} />
                )}
                Load sample law
              </button>
            </div>
            <div className="rail-recovery">
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
        existingCandidates={show.candidates}
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
        candidate={evidenceCandidate}
      />
      <LawLibrary
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        showId={show.id}
        mode={activationMode}
        disabled={
          Boolean(busy) ||
          isWorking ||
          needsUpgrade ||
          stackFull ||
          Boolean(faultIssue)
        }
        onImported={(imported) => {
          if (currentShow.current?.id !== imported.id) return;
          setShow((current) =>
            current && current.revision > imported.revision
              ? current
              : imported,
          );
          setNextRound(false);
          notify(
            "Saved source retested for this world. Preview the exact combination before approval.",
          );
        }}
      />
      <ModerationPanel
        open={moderationOpen}
        onClose={() => setModerationOpen(false)}
        show={show}
        repliesAuthorized={Boolean(status?.twitch.chatRepliesAuthorized)}
        disabled={Boolean(busy) || recoveringFault || Boolean(faultIssue)}
        onUpdated={(updated) => {
          if (currentShow.current?.id !== updated.id) return;
          setShow((current) =>
            current && current.revision > updated.revision ? current : updated,
          );
          if (
            updated.proposals.some(
              (proposal) =>
                proposal.id === selectedId &&
                ["hidden", "rejected"].includes(proposal.status),
            )
          )
            setSelectedId(null);
        }}
      />
      <ShowManager
        open={showManagerOpen}
        onClose={() => setShowManagerOpen(false)}
        currentId={show.id}
        disabled={Boolean(busy) || recoveringFault || Boolean(faultIssue)}
        onResume={resumeShow}
        onCreate={async (mode) => {
          await createShow(mode);
        }}
      />
      <Modal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title="Update saved world"
      >
        <p className="modal-copy">
          Start from the opening checkpoint with no active laws. Your earlier
          save stays available; saved laws need a new preview and approval.
        </p>
        <div className="modal-actions">
          <button
            className="button button-quiet"
            onClick={() => setUpgradeOpen(false)}
          >
            Keep the earlier save
          </button>
          <button
            className="button button-primary"
            disabled={Boolean(busy) || !authority}
            onClick={() => void upgradeWorld()}
          >
            Update world <ArrowRight size={15} />
          </button>
        </div>
      </Modal>
      <Modal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title="Outputs"
      >
        {[
          {
            label: "Overlay (Browser Source)",
            path: `/overlay/${show.id}`,
            openPath: `/overlay/${show.id}?preview=1`,
          },
          {
            label: "Game (Window Capture)",
            path: `/broadcast?show=${show.id}`,
          },
          { label: "Community board", path: `/community/${show.id}` },
        ].map(({ label, path, openPath }) => (
          <section className="share-section" key={label}>
            <h3>{label}</h3>
            <div className="share-row">
              <input
                className="dialog-field"
                readOnly
                value={`${publicOrigin}${path}`}
                aria-label={`${label} URL`}
              />
              <button
                className="icon-button"
                title={`Copy ${label} URL`}
                aria-label={`Copy ${label} URL`}
                onClick={() => void copy(`${publicOrigin}${path}`)}
              >
                <Copy size={16} />
              </button>
              <a
                className="icon-button"
                title={`Open ${label}`}
                aria-label={`Open ${label}`}
                href={openPath || path}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={16} />
              </a>
            </div>
          </section>
        ))}
        <div className="modal-actions">
          <button
            className="button button-primary"
            onClick={() => setShareOpen(false)}
          >
            Done
          </button>
        </div>
      </Modal>
      <Modal
        open={recoveryOpen}
        onClose={() => setRecoveryOpen(false)}
        title="Restore checkpoint"
      >
        <p className="modal-copy">
          Restore the world before the last activation. Progress since that
          checkpoint will reset.
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
          {isSampleLaw(proposal) ? (
            <StatusChip variant="warm">Sample</StatusChip>
          ) : proposal.ancestry?.kind === "adaptation" ? (
            <span className="proposal-origin">
              {adaptationLabel(proposal.ancestry.adaptationSource)}
            </span>
          ) : null}
          <span className="proposal-selected-dot" />
        </span>
        <span className="proposal-copy">{proposal.text}</span>
      </button>
      <div className="proposal-card-foot">
        {(!isSampleLaw(proposal) || ruleCredit(proposal)) && (
          <span className="author-chip">
            <span className="author-avatar">
              {proposal.author[0]?.toUpperCase()}
            </span>
            {isSampleLaw(proposal) ? ruleCredit(proposal) : proposal.author}
          </span>
        )}
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

function Pipeline({ onCancel, busy }: { onCancel: () => void; busy: boolean }) {
  return (
    <div className="pipeline" role="status">
      <div className="pipeline-art">
        <ForgeMark size={37} />
      </div>
      <h3>Forging…</h3>
      <button
        className="button button-quiet"
        onClick={onCancel}
        disabled={busy}
      >
        Cancel
      </button>
    </div>
  );
}

/** Rail law card chips: reused artifacts and sample-origin laws are marked Sample. */
export function LawCardStatus({
  reused,
  proposal,
  onVerified,
}: {
  reused?: boolean;
  proposal?: Proposal;
  onVerified: () => void;
}) {
  return (
    <div className="candidate-status">
      {(reused || isSampleLaw(proposal)) && (
        <StatusChip variant="warm">Sample</StatusChip>
      )}
      <button
        className="chip status-chip status-chip--good verified-chip"
        onClick={onVerified}
      >
        <Check size={14} /> Verified
      </button>
    </div>
  );
}

export function StudioTitle({ mode }: { mode: ShowMode }) {
  return (
    <div className="title-line">
      <h1>The Last Light</h1>
      {mode === "practice" && <StatusChip variant="warm">Practice</StatusChip>}
    </div>
  );
}
