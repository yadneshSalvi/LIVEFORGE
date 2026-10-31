export interface ViewTicket {
  generation: number;
  showId: string;
}

/** Keeps requests issued for one studio view from resurrecting it after navigation. */
export class StudioViewFence {
  private generation = 0;
  private transitioning = false;

  begin() {
    this.transitioning = true;
    return ++this.generation;
  }

  finish(generation: number) {
    if (generation === this.generation) this.transitioning = false;
  }

  ticket(showId: string | null | undefined): ViewTicket | null {
    return this.transitioning || !showId
      ? null
      : { generation: this.generation, showId };
  }

  accepts(
    ticket: ViewTicket,
    currentShowId: string | null | undefined,
    resultShowId: string,
  ) {
    return (
      !this.transitioning &&
      ticket.generation === this.generation &&
      ticket.showId === currentShowId &&
      ticket.showId === resultShowId
    );
  }
}
