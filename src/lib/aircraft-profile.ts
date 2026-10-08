interface AircraftProfile {
  type: "Airplane" | "Helicopter";
  seats?: number;
  image?: string;
  imageSource?: string;
  resources?: Array<{ label: string; href: string }>;
}

const sharedBellResource = {
  label: "Bell 206 series information",
  href: "https://aviation.wv.gov/media/266/download?inline",
};

const profiles: Record<string, AircraftProfile> = {
  N1WV: {
    type: "Airplane",
    seats: 9,
    image: "https://aviation.wv.gov/media/176/download?inline",
    imageSource: "West Virginia Aviation Division",
    resources: [
      {
        label: "King Air 350 aircraft information",
        href: "https://aviation.wv.gov/media/281/download?inline",
      },
    ],
  },
  N2WV: {
    type: "Airplane",
    seats: 8,
    resources: [
      {
        label: "West Virginia selling state-owned airplane",
        href: "https://www.wvgazettemail.com/news/west-virginia-selling-state-owned-airplane/article_68806e6e-2781-52b1-84cc-75126fd1c994.html",
      },
    ],
  },
  N3WV: {
    type: "Helicopter",
    seats: 5,
    image: "https://aviation.wv.gov/media/171/download?inline",
    imageSource: "West Virginia Aviation Division",
    resources: [
      {
        label: "Bell 407 helicopter information",
        href: "https://aviation.wv.gov/media/261/download?inline",
      },
    ],
  },
  N5WV: {
    type: "Helicopter",
    seats: 5,
    image: "https://aviation.wv.gov/sites/default/files/2026-03/IMG_2312.jpg",
    imageSource: "West Virginia Aviation Division",
    resources: [sharedBellResource],
  },
  N6WV: {
    type: "Helicopter",
    seats: 3,
    image: "https://aviation.wv.gov/media/136/download?inline",
    imageSource: "West Virginia Aviation Division",
    resources: [sharedBellResource],
  },
  N890SP: {
    type: "Helicopter",
    seats: 2,
    image: "https://www.helis.com/h2/th-67_n890sp.jpg",
    imageSource: "West Virginia State Police",
  },
  N895SP: {
    type: "Helicopter",
    seats: 2,
  },
};

export function getAircraftProfile(
  tailNo: string,
  manufacturer?: string | null,
): AircraftProfile {
  return (
    profiles[tailNo.toLocaleUpperCase("en-US")] ?? {
      type: manufacturer?.toLocaleLowerCase().includes("bell") ? "Helicopter" : "Airplane",
    }
  );
}
