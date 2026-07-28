import DisplayAvatar from "./DisplayAvatar";

type Props = {
  name: string;
  src?: string | null;
  className?: string;
  fallbackLabel?: string;
};

export default function ProviderIcon({ name, src, className, fallbackLabel }: Props) {
  return <DisplayAvatar name={fallbackLabel || name} src={src} className={className} />;
}
