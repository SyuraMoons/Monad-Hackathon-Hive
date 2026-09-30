import { HeroScrub } from "@/components/hero/HeroScrub";
import { BuiltOn } from "@/components/landing/BuiltOn";
import { Closing } from "@/components/landing/Closing";
import { DottedDivider } from "@/components/landing/DottedDivider";
import { Footer } from "@/components/landing/Footer";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Isolation } from "@/components/landing/Isolation";
import { WireUp } from "@/components/landing/WireUp";
import { SiteHeader } from "@/components/site/SiteHeader";

// Figma 03 · Landing, frame 5:4
export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <HeroScrub />
        <Isolation />
        <DottedDivider className="mt-9" />
        <WireUp />
        <DottedDivider />
        <HowItWorks />
        <DottedDivider />
        <BuiltOn />
        <DottedDivider />
        <Closing />
      </main>
      <Footer />
    </>
  );
}
