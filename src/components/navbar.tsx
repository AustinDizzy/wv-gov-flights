import Link from "next/link";
import {
    NavigationMenu,
    NavigationMenuList,
    NavigationMenuItem,
    NavigationMenuLink,
    NavigationMenuTrigger,
    NavigationMenuContent,
    navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu';
import Image from "next/image";

export function Navbar({ aircraft }: {
    aircraft?: string[]
}) {
    return (
        <div className="border-b py-4 relative z-50">
            <div className="flex flex-col md:flex-row gap-4 px-4 container mx-auto">
                <Link className="flex flex-col md:flex-row items-center gap-4 relative h-fit mx-auto md:mx-0" href="/">
                    <Image src="/logo.png" alt="logo" width={148} height={148} className="pb-2" />
                    <div className="text-center md:text-left">
                        <h1 className="block text-3xl font-medium">Golden Dome Airways</h1>
                        <p className="text-muted-foreground italic flex items-center gap-1 justify-center md:justify-start">
                            <small>(unofficial)</small> flight logs for State of WV aircraft
                        </p>
                    </div>
                </Link>
                <NavigationMenu className="xs:mx-auto md:ml-auto">
                    <NavigationMenuList className="gap-6">
                        <NavigationMenuItem className="hidden md:block">
                            <Link href="/" legacyBehavior passHref>
                                <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                                    Home
                                </NavigationMenuLink>
                            </Link>
                        </NavigationMenuItem>
                        <NavigationMenuItem>
                            <NavigationMenu className="relative z-10">
                                <NavigationMenuTrigger>
                                    Aircraft
                                </NavigationMenuTrigger>
                                <NavigationMenuContent className="z-[100]">
                                    <ul className="space-y-2 z-10">
                                    {aircraft?.map((tail_no) => (
                                    <NavigationMenuItem asChild key={tail_no}>
                                        <Link href={`/aircraft/${tail_no}`} className="block hover:text-accent hover:underline">
                                        <li className="hover:bg-muted/50 transition-colors px-4 py-2">
                                            {tail_no}
                                        </li>
                                        </Link>
                                    </NavigationMenuItem>
                                    ))}
                                    </ul>
                                </NavigationMenuContent>
                            </NavigationMenu>
                        </NavigationMenuItem>
                        <NavigationMenuItem>
                            <Link href="/passengers" legacyBehavior passHref>
                                <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                                    Passengers
                                </NavigationMenuLink>
                            </Link>
                        </NavigationMenuItem>
                        <NavigationMenuItem>
                            <Link href="/trips" legacyBehavior passHref>
                                <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                                    Trips
                                </NavigationMenuLink>
                            </Link>
                        </NavigationMenuItem>
                    </NavigationMenuList>
                </NavigationMenu>
            </div>
        </div>
    );
}