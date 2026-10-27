/** The hint under every picture-link field. A Google Drive file that is shared only with its owner looks fine to the owner
 *  and broken to everyone else, so the steps to share it are one tap away wherever a picture link is asked for. */
export default function ImageLinkHelp({ what = 'picture' }: { what?: string }) {
  return (
    <details className="small muted">
      <summary>A secure (https) link to the {what}. Pictures must be public: how to share a Google Drive file</summary>
      <ol style={{ margin: '6px 0 0', paddingLeft: 20 }}>
        <li>In Google Drive, open the file&rsquo;s Share dialog.</li>
        <li>Under General access, choose &ldquo;Anyone with the link&rdquo; and the role Viewer.</li>
        <li>Copy the link and paste it here.</li>
        <li>Check it: open the link in a private window. If Google asks you to sign in, listeners will not see the picture either.</li>
      </ol>
    </details>
  );
}
