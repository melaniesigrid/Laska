import { useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import './landing.css';

/**
 * A subpage about Emanuel Lasker. Facts drawn from chessorb.com's biography,
 * with the Havana family story the founder passed down. Uses the landing's
 * stone palette + scoped styles.
 */
export function LaskerPage({
  onBack,
  onPlay,
  onReplay,
}: {
  onBack: () => void;
  onPlay: () => void;
  onReplay: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const els = root.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add('in'), io.unobserve(e.target))),
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // restore scroll position to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="landing-page" ref={rootRef}>
      <header className="topbar">
        <div className="wrap">
          <button className="btn" onClick={onBack}>
            <ArrowLeft size={16} /> Back
          </button>
          <button className="btn" onClick={onPlay}>
            <span className="dot" />
            Play the game
          </button>
        </div>
      </header>

      <section className="hero" style={{ paddingBottom: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap">
          <div className="lasker-grid" style={{ alignItems: 'center' }}>
            <div className="portrait reveal" style={{ position: 'static' }}>
              <div className="medallion medallion-photo">
                <img src="/young-emanuel-lasker.png" alt="Emanuel Lasker as a young man" loading="lazy" />
              </div>
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <span className="name">Emanuel Lasker</span>
                <span className="years">1868 — 1941</span>
              </div>
            </div>
            <div className="reveal">
              <p className="eyebrow">The Complicated Master</p>
              <h1 style={{ fontSize: 'clamp(2.6rem,5.5vw,4.2rem)', margin: '0.7rem 0 0' }}>
                A champion who treated games as <em className="serif">serious thought.</em>
              </h1>
              <p className="lede" style={{ maxWidth: '46ch' }}>
                World Chess Champion for twenty-seven years, doctor of mathematics, philosopher, friend
                of Einstein — and, in 1911, the inventor of Laska.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section style={{ paddingBlock: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap" style={{ maxWidth: '760px' }}>
          <div className="reveal">
            <p className="eyebrow">The rise</p>
            <h2 className="lead-h2" style={{ maxWidth: '24ch' }}>From a Berlin maths student to the world's best.</h2>
            <p className="section-intro" style={{ maxWidth: 'none' }}>
              Lasker was born on Christmas Eve, 1868, in Berlinchen, Prussia — today Barlinek, Poland —
              the son of a Jewish cantor, and registered at birth as <em className="serif">Immanuel</em>.
              At eleven he was sent to Berlin to study mathematics, lodging with his elder brother
              Berthold, a fine player himself, who taught him chess. He took to the board with the same
              ease he took to algebra: German Master at twenty-one, and by 1894 bold enough to
              challenge the reigning champion.
            </p>
            <p className="section-intro" style={{ maxWidth: 'none', marginTop: '1.2rem' }}>
              On the way he produced one of the most astonishing results the game has seen — at{' '}
              <b style={{ color: 'var(--l-ink)' }}>New York 1893 he won all thirteen games</b>, a perfect
              score. He still had to scrape together the stake for the title match and renegotiate the
              terms more than once, and almost nobody expected him to win. He beat Wilhelm Steinitz{' '}
              <b style={{ color: 'var(--l-ink)' }}>10–5</b> with four draws, and the shock ran through the
              whole chess world.
            </p>
          </div>
        </div>
      </section>

      <section style={{ paddingBlock: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap" style={{ maxWidth: '760px' }}>
          <div className="reveal">
            <p className="eyebrow">The longest reign in history</p>
            <h2 className="lead-h2" style={{ maxWidth: '20ch' }}>Twenty-seven years on top.</h2>
            <p className="section-intro" style={{ maxWidth: 'none' }}>
              Lasker held the title for almost twenty-seven years — still a record, and likely to stay
              one. He defended it against Steinitz again, then Marshall, Tarrasch, Janowski and
              Schlechter, while winning the great tournaments of the age: Nuremberg 1896, London 1899,
              Paris 1900, and famously St Petersburg 1914.
            </p>
            <p className="section-intro" style={{ maxWidth: 'none', marginTop: '1.2rem' }}>
              He was also a reformer. Having watched Steinitz die in poverty, Lasker insisted that
              masters be paid properly — high stakes for matches, and the right of players to own the
              games they played. Some called it selfish; in time it became the foundation of
              professional chess.
            </p>
          </div>
        </div>
      </section>

      <section style={{ paddingBlock: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap" style={{ maxWidth: '760px' }}>
          <div className="reveal">
            <p className="eyebrow">Havana, 1921</p>
            <h2 className="lead-h2" style={{ maxWidth: '22ch' }}>The reign ends in the Cuban heat.</h2>
            <p className="section-intro" style={{ maxWidth: 'none' }}>
              José Raúl Capablanca, the "Human Chess Machine," had spent years frustrated by how hard it
              was to pin Lasker to a match. Capablanca and his backers finally drew the champion to
              Havana in 1921 — into the full weight of the Cuban heat. The conditions broke him. For the
              first time in his championship life Lasker began losing games, and he conceded the match
              without a single win: <b style={{ color: 'var(--l-ink)' }}>0–4 with ten draws</b>.
            </p>
            <p className="section-intro" style={{ maxWidth: 'none', marginTop: '1.2rem' }}>
              The story passed down in the family is that the heat overwhelmed him entirely — that at
              the close he was carried off by ambulance, his twenty-seven-year reign ending not at the
              board but in the Havana sun.
            </p>
          </div>
        </div>
      </section>

      <section style={{ paddingBlock: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap" style={{ maxWidth: '760px' }}>
          <div className="reveal">
            <p className="eyebrow">After the crown</p>
            <h2 className="lead-h2" style={{ maxWidth: '24ch' }}>Exile, and one last astonishing result.</h2>
            <p className="section-intro" style={{ maxWidth: 'none' }}>
              Lasker played little serious chess after Havana. He turned to bridge and Go, and in 1911
              he had already invented his own game — Laska. Then in 1933, as the Nazis stripped Jews of
              their property and citizenship, Lasker and his wife Martha were forced to flee Germany.
              After a spell in England they were invited to the USSR, where he renounced his German
              citizenship and took a post at Moscow's Institute for Mathematics. Pushed back to the
              board by financial pressure in his sixties, he finished an incredible{' '}
              <b style={{ color: 'var(--l-ink)' }}>3rd at Moscow 1935</b> — more than forty years after
              first becoming champion.
            </p>
            <p className="section-intro" style={{ maxWidth: 'none', marginTop: '1.2rem' }}>
              When Stalin's Great Purge closed in, the Laskers left once more, reaching New York in 1937
              by way of the Netherlands. He died there in 1941 of a kidney infection, a charity patient
              at Mount Sinai — and, like Steinitz before him, penniless despite a lifetime at the very
              top of the game.
            </p>
          </div>
        </div>
      </section>

      <section style={{ paddingBlock: 'clamp(2rem,5vw,3.5rem)' }}>
        <div className="wrap">
          <div className="reveal">
            <p className="eyebrow">Beyond the board</p>
            <h2 className="lead-h2">More than a chess player.</h2>
          </div>
          <div className="rules-grid reveal">
            <article className="card">
              <span className="idx">Mathematics</span>
              <h3>The Lasker–Noether theorem</h3>
              <p>
                A doctorate at Erlangen in 1902, and the primary decomposition of ideals — later
                generalised by Emmy Noether — that still sits at the foundation of modern ring theory.
              </p>
            </article>
            <article className="card">
              <span className="idx">Philosophy</span>
              <h3>Every position, its own creature</h3>
              <p>
                Lasker rejected the idea that chess is governed by fixed rules. Sometimes the knight on
                the rim is right; sometimes you break the principle. The position decides.
              </p>
            </article>
            <article className="card">
              <span className="idx">Friendship</span>
              <h3>A friend of Einstein</h3>
              <p>
                Albert Einstein knew Lasker well and wrote the foreword to his biography — two minds who
                treated games and physics with the same seriousness.
              </p>
            </article>
            <article className="card">
              <span className="idx">Family</span>
              <h3>A poet in the family</h3>
              <p>
                His sister-in-law was <b>Else Lasker-Schüler</b>, one of the great German Expressionist
                poets — the arts and the sciences meeting across one family table.
              </p>
            </article>
            <article className="card note">
              <h3>And one game of his own</h3>
              <p>
                In 1911 he published <em className="serif">The Rules of Lasca, the Great Military
                Game</em> — the column-stacking draughts you can play here.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="closing">
        <div className="wrap">
          <div className="panel reveal">
            <p className="eyebrow" style={{ marginBottom: '1.2rem' }}>His game, in your hands</p>
            <h2>
              Play the game <em className="serif">Lasker built.</em>
            </h2>
            <p>A century on, the column still rises with every capture. Step onto the board.</p>
            <div className="hero-actions" style={{ justifyContent: 'center' }}>
              <button className="btn btn-lg" onClick={onPlay}>
                <span className="dot" />
                Play Laska
              </button>
              <button className="btn" onClick={onReplay}>
                Watch a historic game
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <span className="mark">
            Las<span>k</span>a
          </span>
          <span className="fine">Biography after chessorb.com, Wikipedia &amp; lasca.org · family recollection of Havana, 1921</span>
        </div>
      </footer>
    </div>
  );
}
