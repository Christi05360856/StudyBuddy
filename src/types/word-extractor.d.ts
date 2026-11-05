// PATH: src/types/word-extractor.d.ts
// The "word-extractor" package (reads old .doc files) ships without types.
declare module "word-extractor" {
  class WordExtractor {
    extract(input: string | Buffer): Promise<{ getBody(): string }>
  }
  export default WordExtractor
}
