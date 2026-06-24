// stars.ts
//
// The rc3 shell stashes parsed STARs on window.SB.stars and generateFromRule
// reads them for the excludeNonRouting filter. The port keeps that exact
// behavior behind a tiny accessor so the App can mirror its STARs state here
// (as the shell mirrors to window.SB.stars), and generateFromRule reads them.

let _stars: any[] = [];

export function setStars(stars: any[] | null | undefined): void {
  _stars = stars || [];
}

export function getStars(): any[] {
  return _stars;
}
