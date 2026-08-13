import DisplayAvatar from "./DisplayAvatar";

type Props = {
  name: string;
  src?: string | null;
  sources?: string[];
  className?: string;
  fallbackLabel?: string;
};

export default function ProviderIcon({ name, src, sources, className, fallbackLabel }: Props) {
  return <DisplayAvatar name={fallbackLabel || name} src={src} sources={sources} className={className} />;
}
