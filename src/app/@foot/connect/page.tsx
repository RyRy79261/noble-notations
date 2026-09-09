import { PageFoot } from '@/components/f/page-foot';

/**
 * `/connect`'s foot. `access-1280.html:786` — the generic issue line on the
 * left, which is `PageFoot`'s own default, and the slash path on the right.
 */
export default function ConnectFoot() {
  return <PageFoot right="NN/connect" />;
}
