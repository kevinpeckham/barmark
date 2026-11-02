/** A file Bun embeds in the compiled binary (`with { type: "file" }`): its path at run time. */
declare module "*.otf" {
	const path: string;
	export default path;
}
