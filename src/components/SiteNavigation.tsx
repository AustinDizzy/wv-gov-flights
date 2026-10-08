import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";

interface NavigationItem {
  href: string;
  label: string;
  section: string;
  active: boolean;
}

export default function SiteNavigation({ items }: { items: NavigationItem[] }) {
  return (
    <NavigationMenu
      className="ml-auto flex max-w-max flex-none items-center max-[900px]:order-3 max-[900px]:ml-0 max-[900px]:max-w-none max-[900px]:basis-full max-[900px]:flex-1 max-[900px]:flex-wrap max-[900px]:justify-center max-[560px]:w-full"
      viewport={false}
      aria-label="Primary navigation"
    >
      <NavigationMenuList className="gap-[.4rem] max-[560px]:w-full max-[560px]:gap-[.15rem]">
        {items.map((item) => (
          <NavigationMenuItem key={item.section}>
            <NavigationMenuLink
              href={item.href}
              active={item.active}
              aria-current={item.active ? "page" : undefined}
              data-section={item.section}
              className="block whitespace-nowrap rounded-[.45rem] px-[.82rem] py-[.58rem] text-[.86rem] font-[650] text-[#cbd9e2] no-underline hover:bg-white/[.08] hover:text-white data-[active=true]:bg-white/[.07] data-[active=true]:text-gold-300 max-[560px]:px-[.48rem] max-[560px]:py-2 max-[560px]:text-[.8rem]"
            >
              {item.label}
            </NavigationMenuLink>
          </NavigationMenuItem>
        ))}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
