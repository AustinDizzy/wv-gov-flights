import { ModeToggle } from '@/components/ui/mode-toggle';
import { Github, Mail } from 'lucide-react';
import Link from 'next/link';

export const Footer: React.FC = () => {
    return (
        <footer className="border-t">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 container mx-auto px-4 py-8">
                <div className='text-muted-foreground text-xs space-y-4'>
                    <p>Information on this site is classified as public record and was obtained from legal requests pursuant to <Link href="https://code.wvlegislature.gov/29B-1/" className='border-b border-dotted border-[hsl(var(--muted-foreground))] whitespace-nowrap' target='nofollow noopener'>W.Va. Code § 29B-1-1 et. seq. (WVFOIA)</Link>. Read <Link href={"/data-sources"} className='hover:text-primary underline'>Data Sources</Link> for more information.</p>
                    <p>This site is not affiliated with the government of the <span className='whitespace-nowrap'>State of West Virginia</span>.</p>
                </div>
                <div className='ml-auto flex gap-8 items-center text-xs'>
                    <div className='flex flex-col gap-4 items-center ml-auto'>
                    <Link href="mailto:~abs/wv-gov-flights@lists.sr.ht" className='hover:text-primary hover:underline text-muted-foreground/50 font-mono flex gap-1 items-center' target='nofollow noopener'>
                        <Mail size={12} className='inline' />~abs/wv-gov-flights@lists.sr.ht
                    </Link>
                    <Link href="https://github.com/AustinDizzy/wv-gov-flights" className='hover:text-primary hover:underline text-muted-foreground/50 font-mono flex gap-1 items-center' target='nofollow noopener'>
                        <Github size={12} className='inline' />wv-gov-flights
                    </Link>
                    </div>
                    <ModeToggle />
                </div>
            </div>
        </footer>
    );
};